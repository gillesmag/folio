use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

pub const CLIENT_ID: &str = "folio-cli";

#[derive(Debug, Default, Serialize, Deserialize)]
struct FileConfig {
    server: Option<String>,
}

/// Effective configuration: the server URL plus where credentials live.
#[derive(Debug, Clone)]
pub struct Config {
    pub server: String,
}

impl Config {
    /// `--server` / `FOLIO_SERVER` wins, then the config file. Login persists the server.
    pub fn load(override_server: Option<String>) -> Result<Self> {
        let file = read_file()?;
        let server = override_server
            .or(file.server)
            .map(|s| s.trim_end_matches('/').to_string());
        match server {
            Some(server) => Ok(Config { server }),
            None => bail!("no server configured; run `folio login --server https://your-folio.example`"),
        }
    }

    pub fn save_server(&self) -> Result<()> {
        let path = config_path()?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;
        }
        let body = toml::to_string(&FileConfig { server: Some(self.server.clone()) })?;
        fs::write(&path, body).with_context(|| format!("writing {}", path.display()))
    }

    pub fn document_url(&self, id: &str) -> String {
        format!("{}/d/{id}", self.server)
    }

    /// Keyring account name: one credential per server.
    pub fn credential_account(&self) -> String {
        self.server
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .to_string()
    }
}

pub fn config_dir() -> Result<PathBuf> {
    dirs::config_dir()
        .map(|d| d.join("folio"))
        .context("could not determine the user config directory")
}

fn config_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("config.toml"))
}

fn read_file() -> Result<FileConfig> {
    let path = config_path()?;
    match fs::read_to_string(&path) {
        Ok(s) => toml::from_str(&s).with_context(|| format!("parsing {}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileConfig::default()),
        Err(e) => Err(e).with_context(|| format!("reading {}", path.display())),
    }
}
