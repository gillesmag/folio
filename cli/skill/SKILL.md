---
name: folio
description: Push markdown documents to Folio and read back comments. Use when asked to share a document, report, or plan with the user, or to check their feedback on one.
---

# Folio CLI

`folio` publishes markdown to the user's Folio instance and reads comments back.
Documents are private by default. Rendering supports GFM, math, code highlighting, and Mermaid.

## Auth

- Interactive: `folio login` (opens a browser, device flow).
- Non-interactive: set `FOLIO_API_KEY` (created at Settings → API keys) and `FOLIO_SERVER`.

## Commands

```sh
folio push report.md                         # create; prints the URL
folio push report.md --title "Q3 plan" --visibility unlisted
folio push report.md --id <id>               # replace an existing document
cat notes.md | folio push -                  # from stdin
folio list [--json]
folio pull <id> [-o file.md]                 # markdown source
folio comments <id> [--json]                 # feedback left by the user, with block ids
folio rm <id>
```

## Workflow

1. Write the markdown to a file, then `folio push` it. Share the printed URL.
2. When asked to revise, `folio comments <id>` to read feedback. Comments carry a `block_id`
   that matches `data-block-id` attributes in the rendered HTML; the block is the paragraph,
   heading, list, table, or code block being discussed.
3. Update the file and `folio push file.md --id <id>` so the URL stays the same.

Use `--json` when you need to parse output.
