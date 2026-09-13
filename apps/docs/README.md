# Folio documentation

Fumadocs on Next.js, exported as a static website for Cloudflare Workers. Content lives in `content/docs`.

Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @folio/docs dev
```

Open <http://localhost:3000>.

## Validate and build

```sh
pnpm --filter @folio/docs check
pnpm --filter @folio/docs build
pnpm --filter @folio/docs preview
```

`build` writes the website to `apps/docs/out`. `preview` serves it with Wrangler on port 3000. `pnpm --filter @folio/docs deploy` builds and publishes the `folio-documentation` Worker.

The site has browser-side search, `/llms.txt`, `/llms-full.txt`, `/openapi.json`, and a Markdown URL for every documentation page. The API playground is disabled because each reader has their own Folio origin. Their instance provides interactive API docs at `/api/docs`.

## Update references

`dev`, `check`, and `build` regenerate the OpenAPI schema and endpoint pages from `@folio/contract`. To regenerate during a running development session:

```sh
pnpm --filter @folio/docs generate
```

Generated API pages, the schema, and the Markdown data are ignored by Git. Edit `packages/contract` to change endpoint schemas. Auth and behavior notes live in the authored pages under `content/docs/api`.

CLI command help is a committed snapshot so website builds do not require Rust. After changing CLI arguments, regenerate it with a Rust toolchain installed:

```sh
pnpm --filter @folio/docs generate:cli
```

Commit `content/docs/cli/commands.mdx` with the CLI change. Update the CLI overview and configuration pages when behavior changes.

## Hosting

The [Cloudflare guide](content/docs/self-hosting/cloudflare.mdx) covers the API, web app, and docs website, including OAuth, secrets, domains, and Workers Builds.

The docs Worker uses static assets only. Its name is `folio-documentation`; `folio-docs` is the API's R2 bucket. It has no secrets or bindings to the API.
