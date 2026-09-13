# folio CLI

## Install

Download an archive from [GitHub Releases](https://github.com/gillesmag/folio/releases), extract it, and put `folio` or `folio.exe` on your `PATH`.

| Platform             | Archive                                  |
| -------------------- | ---------------------------------------- |
| macOS, Apple Silicon | `folio-aarch64-apple-darwin.tar.xz`      |
| macOS, Intel         | `folio-x86_64-apple-darwin.tar.xz`       |
| Linux, ARM64         | `folio-aarch64-unknown-linux-gnu.tar.xz` |
| Linux, x64           | `folio-x86_64-unknown-linux-gnu.tar.xz`  |
| Windows, x64         | `folio-x86_64-pc-windows-msvc.zip`       |

The repository is private, so sign in with a GitHub account that has access. For example, download and verify the Linux x64 archive with the GitHub CLI:

```sh
gh auth login
gh release download v0.1.0 --repo gillesmag/folio \
    --pattern 'folio-x86_64-unknown-linux-gnu.tar.xz*'
sha256sum --check folio-x86_64-unknown-linux-gnu.tar.xz.sha256
tar -xJf folio-x86_64-unknown-linux-gnu.tar.xz
mkdir -p "$HOME/.local/bin"
install -m 755 folio-x86_64-unknown-linux-gnu/folio "$HOME/.local/bin/folio"
```

Replace the tag and archive name for your version and platform. On macOS, verify checksums with `shasum -a 256 --check`. Make sure the destination directory is on your `PATH`.

To build from source, run this from the repository root:

```sh
cargo install --locked --path cli
```

## Use

```sh
folio login --server https://folio.example.com
folio push README.md
```

Credentials go to the OS keychain when one is available, otherwise to `~/.config/folio/credentials/<host>` (mode 600). `FOLIO_API_KEY` and `FOLIO_TOKEN` override both. The agent skill lives at `skills/cli/` in the repo root.

## Release

The CLI uses [cargo-dist](https://axodotdev.github.io/cargo-dist/book/quickstart/rust.html) to publish GitHub Releases from tags such as `v0.1.0`. Each release includes the five platform archives above, SHA-256 checksums, and shell and PowerShell installers. The generated installers accept `FOLIO_GITHUB_TOKEN` for private downloads.

CLI changes run Clippy, Cargo tests, and startup checks in pull requests and on `main`. Every pull request also validates the release plan. A release waits for the CLI checks and all platform builds to succeed before publishing. CI uses GitHub's built-in token and needs no additional secrets.

Run these commands from the repository root:

1. Install the version of cargo-dist pinned in `dist-workspace.toml`:

   ```sh
   cargo install cargo-dist --version 0.33.0 --locked
   ```

2. Set the version in `cli/Cargo.toml`, then update `Cargo.lock` and check the release plan. This example uses `0.1.0`:

   ```sh
   cargo check -p folio
   cargo clippy --locked -p folio --all-targets -- -D warnings
   cargo test --locked -p folio
   dist plan --tag v0.1.0
   ```

3. Commit and merge the version change and `Cargo.lock` to `main`. From that commit, create and push the matching tag:

   ```sh
   git tag -a v0.1.0 -m "Folio CLI 0.1.0"
   git push origin v0.1.0
   ```

For a prerelease, use a version such as `0.2.0-rc.1` and the tag `v0.2.0-rc.1`. GitHub marks it as a prerelease. The tag version must match `cli/Cargo.toml`.

To change release settings, edit `dist-workspace.toml` and run `dist generate`. Commit both the configuration and `.github/workflows/release.yml`. To check packaging locally without publishing, run `dist build` and inspect `target/distrib/`.
