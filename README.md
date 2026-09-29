# Folio

Push markdown documents with rich content, read them instantly, comment on any block. Built for you, your organizations, and your agents. Hosted on Cloudflare.

## Layout

| Path                | What it is                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | SvelteKit app on Workers (shadcn-svelte, Tailwind v4). Proxies `/api/*` and `/auth/*` to the API.                               |
| `apps/docs`         | Fumadocs documentation website with usage guides, CLI and API references, `llms.txt`, and Cloudflare self-hosting instructions. |
| `apps/api`          | Effect 4 `HttpApi` Worker: documents, comments, Better Auth (Google, device flow, API keys), D1, KV cache.                      |
| `packages/contract` | Effect Schema models and the `HttpApi` definition shared by server and clients. OpenAPI is generated from it.                   |
| `packages/render`   | unified pipeline: GFM, math (KaTeX), Shiki (JS regex engine), Mermaid passthrough, sanitizer, stable block ids.                 |
| `cli`               | Rust CLI (`folio push`, `pull`, `list`, `comments`, …) with device-flow login and API-key support.                              |
| `skills/cli`        | Agent skill that teaches Claude Code and similar tools the CLI workflow.                                                        |

Rendering happens once on write inside the API Worker. Each version of a document is an immutable JSON object in R2 (`docs/<id>/<version>.json`: source, rendered HTML, render metadata); D1 keeps only the index row (owner, title, visibility, current version) and comments. Reads go index row → Cache API → R2, and because the version is in the key, cache entries live for a year and never go stale. Document pages check current permissions on every request. The same HTML will feed the iOS app's web view.

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

CLI downloads and the tag-based release process are documented in [cli/README.md](cli/README.md).

## Documentation website

Run `pnpm --filter @folio/docs dev` and open <http://localhost:3000>. The site includes usage guides, generated CLI command help, API reference pages from `packages/contract`, and a [Cloudflare self-hosting guide](apps/docs/content/docs/self-hosting/cloudflare.mdx).

`pnpm --filter @folio/docs build` exports the static website. See [apps/docs/README.md](apps/docs/README.md) for reference generation, preview, and deployment commands.

## Deploy

Everything runs from `apps/api` unless noted. Wrangler's login is shared by both apps.

```sh
git clone git@github.com:gillesmag/folio.git && cd folio
pnpm install
cd apps/api
pnpm exec wrangler login                       # browser OAuth; grants every permission Wrangler needs

# 1. Resources
pnpm exec wrangler d1 create folio
pnpm exec wrangler r2 bucket create folio-docs

# 2. Account-specific deployment values (this file is ignored by Git)
cp .env.example .env
#    set D1_DATABASE_ID to the UUID printed above
#    set APP_URL to the intended web origin, or http://localhost:5173 temporarily

# 3. First API deploy (generates a private config and applies D1 migrations)
pnpm run deploy

# 4. Secrets (the Worker must exist first)
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
printf '%s' 'YOUR_GOOGLE_CLIENT_ID'     | pnpm exec wrangler secret put GOOGLE_CLIENT_ID
printf '%s' 'YOUR_GOOGLE_CLIENT_SECRET' | pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET

# 5. Web app (binds to the API Worker deployed in step 3; prints its URL)
cd ../web
pnpm run deploy                                # e.g. https://folio-web.<subdomain>.workers.dev

# 6. Point the API at the web origin and redeploy it
cd ../api
#    edit .env: APP_URL=https://folio-web.<subdomain>.workers.dev
pnpm run deploy

# 7. Google Cloud Console → your OAuth client:
#    Authorized JavaScript origin:  https://folio-web.<subdomain>.workers.dev
#    Authorized redirect URI:       https://folio-web.<subdomain>.workers.dev/auth/callback/google

# 8. Smoke test
curl -i https://folio-web.<subdomain>.workers.dev/api/health   # 204
folio login --server https://folio-web.<subdomain>.workers.dev
```

Enable D1 read replication on the database in the dashboard (Settings → Read replication) once traffic comes from more than one region.

### Automatic deploys from GitHub

Workers Builds deploys on every push once each Worker is connected to the repo. Do the manual deploy above once first, so the resources, secrets, and the service binding exist. Then, in the dashboard, open each Worker → Settings → Build → Connect to Git and use:

| Setting                      | `folio-api`                                          | `folio-web`                                                            |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Repository / branch          | `gillesmag/folio`, `main`                            | same                                                                   |
| Root directory               | `apps/api`                                           | `apps/web`                                                             |
| Build command                | leave empty                                          | `pnpm run build`                                                       |
| Deploy command               | `pnpm run deploy` (runs D1 migrations, then deploys) | `pnpm exec wrangler deploy`                                            |
| Build watch paths            | `apps/api/**`, `packages/**`, `pnpm-lock.yaml`       | `apps/web/**`, `packages/**`, `pnpm-lock.yaml`                         |
| Non-production branch builds | off                                                  | optional (previews cannot sign in; `APP_URL` is the production origin) |

For `folio-api`, add `D1_DATABASE_ID` and `APP_URL` under **Settings → Build → Variables and Secrets** before its first automatic build. Mark them as secrets to keep the instance-specific values out of source and masked in the build settings. The deploy script uses them to generate the ignored `apps/api/wrangler.generated.json`; they are distinct from Worker runtime secrets such as `BETTER_AUTH_SECRET`, which persist across deployments.

Node comes from `.node-version`; pnpm from the `packageManager` field. Connect `folio-api` first so the web build always finds its binding.

### Custom domain

Add to `apps/web/wrangler.jsonc` and redeploy the web app, then set the API build variable `APP_URL` (or `apps/api/.env` for a local deploy) to the same origin and redeploy the API. Update the Google OAuth client to match.

```jsonc
"routes": [{ "pattern": "folio.example.com", "custom_domain": true }]
```

### Production checklist

- `BETTER_AUTH_SECRET` must be at least 32 random bytes (`openssl rand -base64 32`); the API refuses to start otherwise.
- `APP_URL` must be the exact https origin of the web Worker. It drives OAuth callbacks, cookie `Secure` flags, and the trusted-origin check.
- Put the web Worker on a custom domain. The API Worker has `workers_dev: false` and is only reachable through the service binding.
- Add a Cloudflare rate-limiting rule on `/auth/*` and `/api/*` as a backstop. Better Auth throttles auth endpoints per IP (60/min, counters in D1) and API keys per key (300/min), but nothing throttles anonymous reads of public documents beyond the KV cache.
- Register the production redirect URI in Google Cloud: `https://<app>/auth/callback/google`.
- When upgrading Better Auth, regenerate its schema with `@better-auth/cli generate` and diff it against `apps/api/migrations`; plugin tables change between versions.

### What the code enforces

- Documents are private by default; private ones answer 404 to anyone outside the owner and the document's organization, so ids cannot be probed. Ids carry ~71 bits of entropy, which is what makes `unlisted` safe.
- Raw HTML in markdown is disabled and the output is sanitized before highlighting; `javascript:` links are dropped. Mermaid runs in its strict mode on the client.
- Pages carry a CSP (`script-src 'self'` with per-request nonces, `frame-ancestors 'none'`), `nosniff`, `X-Frame-Options`, a referrer policy, and HSTS on https.
- Post-login redirects only accept same-origin paths. Cross-site requests are blocked by `SameSite=Lax` cookies, SvelteKit's origin check on form actions, and Better Auth's trusted-origin check.
- Payloads are bounded: 300 KB of markdown, 300-character titles, 20 KB comments.
- Only the `folio-cli` client id may start a device flow, codes expire after 10 minutes, and the approval page names the client before you approve.

## Organizations

Better Auth's organization plugin manages organizations, memberships, and invitations. Folio uses its membership rows to check document access.

Open **Organizations** from your profile menu to create an organization or accept an invitation. Each user can create one organization and join others. The creator invites members by email. Recipients sign in with that email and accept under **Organizations**. Invitations expire after seven days; Folio does not send email.

Documents start in **Personal**. Open a document's **Share** dialog to move it to an organization or back to Personal. Members can read and comment; the document owner keeps control of edits, sharing, and deletion. The document list labels each organization and has a dropdown filter. When a member leaves or is removed, their documents return to Personal.

```sh
folio push notes.md --org acme
folio push notes.md --org org_abc123
folio push notes.md                          # Personal
```

The CLI always defaults to Personal, including uploads with `--id`. Pass `--org` on every upload that belongs in an organization. Find the slug and ID on the organization's settings page.

## API

Bearer session token (`Authorization: Bearer …`, from `folio login`) or `x-api-key` (from Settings → API keys). Interactive docs at `/api/docs`, spec at `/api/openapi.json`.

```sh
curl -X POST "$FOLIO/api/documents" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"source":"# Hello\n\nWorld","visibility":"unlisted"}'
```

## Contributing

Before sending changes, run the test suite with `pnpm test` and the linter. If your change touches the CLI, also run the relevant Cargo tests.
