mod api;
mod auth;
mod config;

use std::io::Read;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use clap::{CommandFactory, Parser, Subcommand, ValueEnum};
use clap_complete::Shell;

use crate::api::{Client, DocumentInput};
use crate::config::Config;

/// Folio: push, read and comment on markdown documents.
#[derive(Parser)]
#[command(name = "folio", version, about)]
struct Cli {
    /// Folio server URL (defaults to the configured one).
    #[arg(long, global = true, env = "FOLIO_SERVER")]
    server: Option<String>,

    /// Print machine-readable JSON instead of text.
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Clone, Copy, ValueEnum)]
enum Visibility {
    Private,
    Unlisted,
    Public,
}

impl Visibility {
    fn as_str(self) -> &'static str {
        match self {
            Visibility::Private => "private",
            Visibility::Unlisted => "unlisted",
            Visibility::Public => "public",
        }
    }
}

#[derive(Subcommand)]
enum Command {
    /// Sign in through the browser (device flow) and store the session token.
    Login,
    /// Forget the stored session token.
    Logout,
    /// Show the signed-in user.
    Whoami,
    /// Push a markdown file (or stdin with "-") as a new document, or replace one with --id.
    Push {
        /// Markdown file to push, or "-" for stdin.
        file: PathBuf,
        /// Title; defaults to frontmatter title or the first heading.
        #[arg(long)]
        title: Option<String>,
        /// Who can see the document.
        #[arg(long, value_enum)]
        visibility: Option<Visibility>,
        /// Replace an existing document instead of creating one.
        #[arg(long)]
        id: Option<String>,
        /// Organization slug or ID; defaults to Personal, including with --id.
        #[arg(long, default_value = "personal")]
        org: String,
    },
    /// List your documents and documents shared with your organizations.
    List,
    /// Print a document's markdown source (or write it to a file).
    Pull {
        id: String,
        /// Write to this path instead of stdout.
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Open a document in the browser.
    Open { id: String },
    /// List comments on a document.
    Comments { id: String },
    /// Delete a document.
    Rm { id: String },
    /// Generate shell completions.
    Completions { shell: Shell },
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("error: {err:#}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();
    if let Command::Completions { shell } = cli.command {
        clap_complete::generate(shell, &mut Cli::command(), "folio", &mut std::io::stdout());
        return Ok(());
    }

    let config = Config::load(cli.server)?;

    match cli.command {
        Command::Login => auth::login(&config).await,
        Command::Logout => auth::logout(&config),
        Command::Whoami => {
            let client = Client::authenticated(&config)?;
            let me = client.me().await?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&me)?);
            } else {
                println!("{} <{}>", me.name, me.email);
            }
            Ok(())
        }
        Command::Push {
            file,
            title,
            visibility,
            id,
            org,
        } => {
            let source = read_source(&file)?;
            let client = Client::authenticated(&config)?;
            let input = DocumentInput {
                title,
                source,
                organization: org,
                visibility: visibility.map(Visibility::as_str),
            };
            let doc = match id {
                Some(id) => client.replace(&id, &input).await?,
                None => client.create(&input).await?,
            };
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&doc.summary())?);
            } else {
                println!("{}", config.document_url(&doc.id));
            }
            Ok(())
        }
        Command::List => {
            let client = Client::authenticated(&config)?;
            let docs = client.list().await?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&docs)?);
            } else if docs.is_empty() {
                println!("No documents yet. Push one with: folio push README.md");
            } else {
                for d in docs {
                    println!(
                        "{:<14} {:<9} v{:<4} {:<18} {}",
                        d.id,
                        d.visibility,
                        d.version,
                        d.organization_id.as_deref().unwrap_or("Personal"),
                        d.title
                    );
                }
            }
            Ok(())
        }
        Command::Pull { id, output } => {
            let client = Client::for_config(&config)?;
            let doc = client.get(&id).await?;
            match output {
                Some(path) => {
                    std::fs::write(&path, doc.source)
                        .with_context(|| format!("writing {}", path.display()))?;
                    eprintln!("wrote {}", path.display());
                }
                None => print!("{}", doc.source),
            }
            Ok(())
        }
        Command::Open { id } => {
            let url = config.document_url(&id);
            open::that(&url).with_context(|| format!("opening {url}"))?;
            Ok(())
        }
        Command::Comments { id } => {
            let client = Client::for_config(&config)?;
            let comments = client.comments(&id).await?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&comments)?);
            } else if comments.is_empty() {
                println!("No comments.");
            } else {
                for c in comments {
                    let anchor = c.block_id.as_deref().unwrap_or("document");
                    let state = if c.resolved { "resolved" } else { "open" };
                    println!(
                        "[{}] {} ({}, {})\n  {}\n",
                        c.id, anchor, state, c.created_at, c.body
                    );
                }
            }
            Ok(())
        }
        Command::Rm { id } => {
            let client = Client::authenticated(&config)?;
            client.remove(&id).await?;
            eprintln!("deleted {id}");
            Ok(())
        }
        Command::Completions { .. } => unreachable!(),
    }
}

fn read_source(file: &PathBuf) -> Result<String> {
    if file.as_os_str() == "-" {
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .context("reading stdin")?;
        return Ok(buf);
    }
    let source =
        std::fs::read_to_string(file).with_context(|| format!("reading {}", file.display()))?;
    if source.trim().is_empty() {
        bail!("{} is empty", file.display());
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uploads_default_to_personal_even_when_replacing() {
        for args in [
            vec!["folio", "push", "notes.md"],
            vec!["folio", "push", "notes.md", "--id", "doc123"],
        ] {
            let cli = Cli::try_parse_from(args).expect("valid push arguments");
            let Command::Push { org, .. } = cli.command else {
                panic!("expected push");
            };
            assert_eq!(org, "personal");
        }
    }

    #[test]
    fn uploads_accept_an_organization_slug_or_id() {
        for selector in ["acme-team", "org_abc123", "personal"] {
            let cli = Cli::try_parse_from(["folio", "push", "-", "--org", selector])
                .expect("valid organization argument");
            let Command::Push { org, .. } = cli.command else {
                panic!("expected push");
            };
            let input = DocumentInput {
                title: None,
                source: "# Notes".to_owned(),
                visibility: None,
                organization: org,
            };
            let payload = serde_json::to_value(input).expect("serializable input");
            assert_eq!(payload["organization"], selector);
        }
    }
}
