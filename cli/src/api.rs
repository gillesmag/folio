use anyhow::{Context, Result, anyhow, bail};
use reqwest::{RequestBuilder, Response, StatusCode};
use serde::{Deserialize, Serialize};

use crate::auth::{self, Credential};
use crate::config::Config;

pub fn http() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(concat!("folio-cli/", env!("CARGO_PKG_VERSION")))
        .build()
        .context("building the HTTP client")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub visibility: String,
    pub version: u64,
    pub source: String,
    pub updated_at: String,
}

impl Document {
    pub fn summary(&self) -> DocumentSummary {
        DocumentSummary {
            id: self.id.clone(),
            title: self.title.clone(),
            visibility: self.visibility.clone(),
            version: self.version,
            updated_at: self.updated_at.clone(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub visibility: String,
    pub version: u64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct DocumentInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<&'static str>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub block_id: Option<String>,
    pub body: String,
    pub resolved: bool,
    pub created_at: String,
}

#[derive(Deserialize)]
struct ApiError {
    #[serde(rename = "_tag")]
    tag: String,
    message: Option<String>,
    id: Option<String>,
}

pub struct Client {
    http: reqwest::Client,
    base: String,
    credential: Option<Credential>,
}

impl Client {
    /// A client that sends credentials if any are stored, for endpoints that allow anonymous reads.
    pub fn for_config(config: &Config) -> Result<Self> {
        Ok(Client {
            http: http()?,
            base: format!("{}/api", config.server),
            credential: auth::load(config)?,
        })
    }

    /// A client that refuses to start without credentials, for a clearer error than a 401.
    pub fn authenticated(config: &Config) -> Result<Self> {
        let client = Self::for_config(config)?;
        if client.credential.is_none() {
            bail!("not signed in; run `folio login` or set FOLIO_API_KEY");
        }
        Ok(client)
    }

    fn with_auth(&self, req: RequestBuilder) -> RequestBuilder {
        match &self.credential {
            Some(Credential::Session(t)) => req.bearer_auth(t),
            Some(Credential::ApiKey(k)) => req.header("x-api-key", k),
            None => req,
        }
    }

    async fn send(&self, req: RequestBuilder) -> Result<Response> {
        let res = self.with_auth(req).send().await.context("request failed")?;
        if res.status().is_success() {
            return Ok(res);
        }
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(match serde_json::from_str::<ApiError>(&body) {
            Ok(e) => match e.tag.as_str() {
                "Unauthorized" => anyhow!("not signed in; run `folio login` or set FOLIO_API_KEY"),
                "DocumentNotFound" => anyhow!("document {} not found", e.id.unwrap_or_default()),
                "CommentNotFound" => anyhow!("comment {} not found", e.id.unwrap_or_default()),
                tag => anyhow!("{tag}: {}", e.message.unwrap_or_default()),
            },
            Err(_) if status == StatusCode::UNAUTHORIZED => {
                anyhow!("not signed in; run `folio login` or set FOLIO_API_KEY")
            }
            Err(_) => anyhow!("server returned {status}: {body}"),
        })
    }

    pub async fn me(&self) -> Result<User> {
        Ok(self.send(self.http.get(format!("{}/me", self.base))).await?.json().await?)
    }

    pub async fn list(&self) -> Result<Vec<DocumentSummary>> {
        Ok(self.send(self.http.get(format!("{}/documents", self.base))).await?.json().await?)
    }

    pub async fn get(&self, id: &str) -> Result<Document> {
        Ok(self.send(self.http.get(format!("{}/documents/{id}", self.base))).await?.json().await?)
    }

    pub async fn create(&self, input: &DocumentInput) -> Result<Document> {
        Ok(self
            .send(self.http.post(format!("{}/documents", self.base)).json(input))
            .await?
            .json()
            .await?)
    }

    pub async fn replace(&self, id: &str, input: &DocumentInput) -> Result<Document> {
        Ok(self
            .send(self.http.put(format!("{}/documents/{id}", self.base)).json(input))
            .await?
            .json()
            .await?)
    }

    pub async fn remove(&self, id: &str) -> Result<()> {
        self.send(self.http.delete(format!("{}/documents/{id}", self.base))).await?;
        Ok(())
    }

    pub async fn comments(&self, id: &str) -> Result<Vec<Comment>> {
        Ok(self
            .send(self.http.get(format!("{}/documents/{id}/comments", self.base)))
            .await?
            .json()
            .await?)
    }
}
