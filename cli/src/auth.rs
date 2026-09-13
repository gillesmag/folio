use std::fs;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::Deserialize;

use crate::api::{Client, http};
use crate::config::{CLIENT_ID, Config, config_dir};

const SERVICE: &str = "folio";

/// A credential the CLI can present: a session token (device flow) or an API key.
#[derive(Debug, Clone)]
pub enum Credential {
    Session(String),
    ApiKey(String),
}

/// Resolution order: FOLIO_API_KEY, FOLIO_TOKEN, OS keychain, then the fallback file.
pub fn load(config: &Config) -> Result<Option<Credential>> {
    if let Ok(key) = std::env::var("FOLIO_API_KEY") {
        return Ok(Some(Credential::ApiKey(key)));
    }
    if let Ok(token) = std::env::var("FOLIO_TOKEN") {
        return Ok(Some(Credential::Session(token)));
    }
    let account = config.credential_account();
    if let Ok(entry) = keyring::Entry::new(SERVICE, &account) {
        match entry.get_password() {
            Ok(token) => return Ok(Some(Credential::Session(token))),
            Err(keyring::Error::NoEntry) => {}
            Err(_) => {} // keychain unavailable (headless box); fall through to the file
        }
    }
    let path = fallback_path(&account)?;
    match fs::read_to_string(&path) {
        Ok(token) => Ok(Some(Credential::Session(token.trim().to_string()))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e).with_context(|| format!("reading {}", path.display())),
    }
}

fn store(config: &Config, token: &str) -> Result<()> {
    let account = config.credential_account();
    if let Ok(entry) = keyring::Entry::new(SERVICE, &account)
        && entry.set_password(token).is_ok()
    {
        return Ok(());
    }
    let path = fallback_path(&account)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(&path, token).with_context(|| format!("writing {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }
    eprintln!("note: OS keychain unavailable, token stored in {}", path.display());
    Ok(())
}

fn clear(config: &Config) -> Result<()> {
    let account = config.credential_account();
    if let Ok(entry) = keyring::Entry::new(SERVICE, &account) {
        let _ = entry.delete_credential();
    }
    let path = fallback_path(&account)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e).with_context(|| format!("removing {}", path.display())),
    }
}

fn fallback_path(account: &str) -> Result<std::path::PathBuf> {
    let safe: String = account
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
        .collect();
    Ok(config_dir()?.join("credentials").join(safe))
}

#[derive(Deserialize)]
struct DeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct TokenOk {
    access_token: String,
}

#[derive(Deserialize)]
struct TokenErr {
    error: String,
    error_description: Option<String>,
}

/// RFC 8628 device flow against Better Auth's device-authorization plugin.
pub async fn login(config: &Config) -> Result<()> {
    let http = http()?;
    let code: DeviceCode = http
        .post(format!("{}/auth/device/code", config.server))
        .json(&serde_json::json!({ "client_id": CLIENT_ID }))
        .send()
        .await
        .context("requesting a device code")?
        .error_for_status()
        .context("server rejected the device code request")?
        .json()
        .await
        .context("decoding the device code response")?;

    let url = code
        .verification_uri_complete
        .clone()
        .unwrap_or_else(|| code.verification_uri.clone());
    eprintln!("Confirm this code in your browser: {}", code.user_code);
    eprintln!("{url}");
    if open::that(&url).is_err() {
        eprintln!("(could not open a browser automatically)");
    }

    let mut interval = Duration::from_secs(code.interval.unwrap_or(5));
    let deadline = tokio::time::Instant::now() + Duration::from_secs(code.expires_in);
    loop {
        if tokio::time::Instant::now() >= deadline {
            bail!("the code expired before it was approved; run `folio login` again");
        }
        tokio::time::sleep(interval).await;
        let res = http
            .post(format!("{}/auth/device/token", config.server))
            .json(&serde_json::json!({
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": code.device_code,
                "client_id": CLIENT_ID
            }))
            .send()
            .await
            .context("polling for the token")?;
        let status = res.status();
        let body = res.text().await.context("reading the token response")?;
        if status.is_success() {
            let ok: TokenOk = serde_json::from_str(&body).context("decoding the token")?;
            store(config, &ok.access_token)?;
            config.save_server()?;
            let me = Client::authenticated(config)?.me().await?;
            eprintln!("Signed in as {} <{}>", me.name, me.email);
            return Ok(());
        }
        let err: TokenErr = serde_json::from_str(&body)
            .unwrap_or(TokenErr { error: body.clone(), error_description: None });
        match err.error.as_str() {
            "authorization_pending" => {}
            "slow_down" => interval += Duration::from_secs(5),
            "access_denied" => bail!("sign-in was denied in the browser"),
            "expired_token" => bail!("the code expired; run `folio login` again"),
            other => bail!("{other}: {}", err.error_description.unwrap_or_default()),
        }
    }
}

pub fn logout(config: &Config) -> Result<()> {
    clear(config)?;
    eprintln!("Signed out of {}", config.server);
    Ok(())
}
