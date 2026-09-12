# folio CLI

```sh
cargo install --path .        # or download a release binary
folio login --server https://folio.example.com
folio push README.md
```

Credentials go to the OS keychain when one is available, otherwise to `~/.config/folio/credentials/<host>` (mode 600). `FOLIO_API_KEY` and `FOLIO_TOKEN` override both. The bundled agent skill is in `skill/`.
