Use pnpm as package manager.
Run `pnpm run check` after completing a task.

Node.js can run `.ts` (see `package.json`) files directly (no need for ts-node or tsx).

Never explicitly write types unless needed. Prefer type inference.

# Git submodules

Noxtara API docs and Bruno are checked in as git submodules under `submodules/`:

- `submodules/product-appsec-apidocs` — Noxtara API docs
- `submodules/bruno` — Bruno API client

After a fresh clone, initialize them with `git clone --recurse-submodules`, or from the repo root run `./scripts/submodules.sh`.

# References directory

The `.references/` directory contains shallow clones of other external repositories.
Never make any changes in this directory; it is ignored by git and meant as reference only.

Prefer exploring and reading this directory (and the submodules above) over searching for documentation. Treat them as the source of truth for their respective projects.

Available references:

- effect-smol — Effect v4
- product-appsec-fe — Noxtara Web Frontend
- mcp-typescript-sdk — MCP TypeScript SDK
