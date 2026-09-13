#!/bin/sh
# Copies the web assets the reader needs into the built app bundle:
# the shared document stylesheet, KaTeX (css + woff2 fonts) and Mermaid.
# Runs as an Xcode build phase; needs `pnpm install` at the repo root first.
set -eu

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB_MODULES="$ROOT/apps/web/node_modules"
DEST="${TARGET_BUILD_DIR:?run from Xcode}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}/WebAssets"

if [ ! -f "$WEB_MODULES/mermaid/dist/mermaid.min.js" ] || [ ! -f "$WEB_MODULES/katex/dist/katex.min.css" ]; then
  echo "error: web dependencies missing; run 'pnpm install' in $ROOT first" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST/katex/fonts"
cp "$ROOT/packages/render/src/styles.css" "$DEST/folio-doc.css"
cp "$WEB_MODULES/katex/dist/katex.min.css" "$DEST/katex/katex.min.css"
cp "$WEB_MODULES"/katex/dist/fonts/*.woff2 "$DEST/katex/fonts/"
cp "$WEB_MODULES/mermaid/dist/mermaid.min.js" "$DEST/mermaid.min.js"
echo "Synced web assets to $DEST"
