# Folio

Push markdown documents with rich content, read them instantly, comment on any block. Built for one person and their agents. Hosted on Cloudflare.

## Layout

| Path                | What it is                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | SvelteKit app on Workers (shadcn-svelte, Tailwind v4). Proxies `/api/*` and `/auth/*` to the API.               |
| `apps/api`          | Effect 4 `HttpApi` Worker: documents, comments, Better Auth (Google, device flow, API keys), D1, KV cache.      |
| `packages/contract` | Effect Schema models and the `HttpApi` definition shared by server and clients. OpenAPI is generated from it.   |
| `packages/render`   | unified pipeline: GFM, math (KaTeX), Shiki (JS regex engine), Mermaid passthrough, sanitizer, stable block ids. |
| `cli`               | Rust CLI (`folio push`, `pull`, `list`, `comments`, …) with device-flow login and API-key support.              |

Rendering happens once on write inside the API Worker. The HTML is stored in D1 and cached in KV, so a document view is one cached read and a template. The same HTML will feed the iOS app's web view.

## Develop

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in BETTER_AUTH_SECRET and Google OAuth creds
pnpm --filter @folio/api db:migrate:local
pnpm --filter @folio/api dev                        # http://localhost:8787
API_URL=http://localhost:8787 pnpm --filter @folio/web dev   # http://localhost:5173
cargo run -p folio -- --help
```

Google OAuth redirect URI: `http://localhost:5173/auth/callback/google` (and the production origin equivalent).

Checks: `pnpm check`, `pnpm test`, `cargo build --release`.

## Deploy

1. Create resources: `wrangler d1 create folio`, `wrangler kv namespace create CACHE`; put the ids in `apps/api/wrangler.jsonc`.
2. Secrets: `wrangler secret put BETTER_AUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET` in `apps/api`. Set `APP_URL` to the web origin.
3. `pnpm --filter @folio/api db:migrate && pnpm --filter @folio/api deploy`
4. `pnpm --filter @folio/web deploy` (the web Worker binds to `folio-api` as a service binding).
5. Enable D1 read replication on the database in the dashboard.

## API

Bearer session token (`Authorization: Bearer …`, from `folio login`) or `x-api-key` (from Settings → API keys). Interactive docs at `/api/docs`, spec at `/api/openapi.json`.

```sh
curl -X POST "$FOLIO/api/documents" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"source":"# Hello\n\nWorld","visibility":"unlisted"}'
```
