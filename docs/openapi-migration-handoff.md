# OpenAPI migration & e2e — handoff

Status as of 2026-05-19. Branch: `main`.

## Completed

### OpenAPI migration (fixes startup OOM)

- **Build-time generation**: `pnpm run generate:openapi` → `specs/main-api.openapi.json` (committed, ~226 operations).
- **Runtime**: `src/runtime/openapi/` — parse, extract, invoke, registry (ported from executor).
- **Removed**: Bruno runtime (`bruno-parse`, `bruno-extract`, `bruno-schemas`, `bruno-registry`, `src/api/client.ts`).
- **Wiring**: MCP (`createNoxtaraMcpServer`), CLI, and `main` exports use `createOpenApiRegistry`.
- **Tool names**: OpenAPI `operationId` (derived from Bruno paths at generation).
- **Auth**: PAT via `NOXTARA_PAT` (stdio) or `/mcp/<pat>` (HTTP); forwarded as `x-pat`.
- **Docs**: `PLAN.md`, `docs/deployment.md` updated for OpenAPI path.

### MCP HTTP server testability

- `startNoxtaraMcpHttpServer()` — returns `{ mcpUrl, close, registry }` for tests and programmatic use.
- `extractPatFromMcpPath()` exported for path-auth tests.
- `createNoxtaraMcpServer({ forceReload })` reloads registry when `baseUrl` overrides are used.

### E2e tests

- `src/mcp/e2e/mcp-http.test.ts` — initialize, tools/list, tools/call, PAT in URL, protocol errors for unknown tools, API error surfacing.
- `src/mcp/e2e/mcp-stdio.test.ts` — shared stdio session for list + invoke; separate spawn for missing-PAT case.
- `src/mcp/e2e/helpers.ts` — mock Main API server, MCP client helpers.
- `vitest.config.ts` — `testTimeout` / `hookTimeout` 60s, `fileParallelism: false` for stable e2e.
- Dev dependency: `@modelcontextprotocol/client@2.0.0-alpha.2`.

### Debug / Effect logging (optional, gated)

- `src/debug/session-log.ts` — NDJSON to `.cursor/debug-814c70.log` when `NOXTARA_DEBUG=1`.
- Instrumentation in registry load, MCP server tool registration, invoke, stdio connect/close.
- Effect: use `Effect.logInfo` + `Effect.withLogSpan` in Effect pipelines; `Logger.make` / `Logger.consolePretty` for dev (see Effect `Logger` module in `.references/effect-smol`).

**Measured timings (local, post-fix):**

| Step                    | ~ms     |
| ----------------------- | ------- |
| OpenAPI parse + extract | 40–100  |
| Register 226 MCP tools  | 260–440 |
| Stdio child connect     | ~1.8s   |
| HTTP tool invoke        | 12–26   |
| Full e2e suite          | ~7–18s  |
| `pnpm run check`        | ~28s    |

Root cause of perceived “timeouts” was **not a hang** — repeated stdio subprocess bootstraps (~2s each × 3 tests). Shared `beforeAll` stdio session reduced stdio file runtime from ~11s to ~6s.

---

## Leftover / follow-up

### Product

- [ ] Regenerate OpenAPI when apidocs changes: `pnpm run generate:openapi` (manual for now).
- [ ] Rename package from `pkg-placeholder` bin/name when ready to publish.
- [ ] Output schemas / stricter response typing (out of scope in PLAN).
- [ ] CLI ergonomics: grouped commands by tag/folder (phase 2 in PLAN).
- [ ] Pagination helpers for common list endpoints.

### Technical debt

- [ ] Remove or gate debug instrumentation (`sessionLog` calls) once stable — currently `NOXTARA_DEBUG=1` only; consider deleting `src/debug/` for production cleanliness.
- [ ] Add `.cursor/` to `.gitignore` if IDE debug logs should never be committed.
- [ ] Oxlint warnings in ported `invoke.ts` (`no-base-to-string`, etc.) — acceptable for now.
- [ ] `PLAN.md` phase checkboxes still unchecked; align with actual completion.
- [ ] Docker image: ensure `specs/main-api.openapi.json` is in image; apidocs submodule not required at runtime (see `docs/deployment.md`).

### Testing

- [ ] CI: ensure `pnpm run generate:openapi` runs before test (or committed spec is always fresh).
- [ ] Optional: single global stdio fixture across entire e2e directory if more stdio tests are added.
- [ ] Optional: smoke test against real dev API behind `NOXTARA_PAT` (skipped in CI).

### Effect logging (recommended next step)

- [ ] Provide `Logger.layer([Logger.consolePretty])` behind `NOXTARA_LOG=pretty` for local MCP/CLI.
- [ ] Use `Effect.withLogSpan` on registry load and tool invoke in production code (not only debug).
- [ ] Wire `References.MinimumLogLevel` for `--log-level debug` on CLI.

---

## Commands

```bash
pnpm run generate:openapi   # regenerate spec from Bruno collection
pnpm run build              # generate + tsdown
pnpm run check              # typecheck, test, lint
pnpm run mcp                # stdio MCP server
pnpm run mcp-http           # HTTP MCP on :3434, path /mcp/<pat>

# e2e only
pnpm exec vitest run src/mcp/e2e

# debug timings (writes .cursor/debug-814c70.log)
NOXTARA_DEBUG=1 pnpm exec vitest run src/mcp/e2e
```

---

## Key paths

| Path                              | Role                                        |
| --------------------------------- | ------------------------------------------- |
| `specs/main-api.openapi.json`     | Committed runtime spec                      |
| `scripts/generate-openapi.ts`     | Build entry                                 |
| `scripts/lib/bruno-to-openapi.ts` | Bruno → OpenAPI emitter                     |
| `src/runtime/openapi/`            | Runtime parse / extract / invoke / registry |
| `src/mcp/server.ts`               | MCP server + HTTP listener                  |
| `src/mcp/e2e/`                    | MCP protocol e2e tests                      |
| `src/debug/session-log.ts`        | Optional debug sink                         |
