# Noxtara MCP — Plan

## Goal

Wrap the Noxtara (Product AppSec) **Main API** as typed, composable Effect functions, then expose them as:

- **MCP tools** (via `@modelcontextprotocol/server`) — for AI assistants (Claude, Copilot, etc.)
- **CLI commands** (via `effect/unstable/cli`) — for human use

## Stack

| Concern         | Choice                                           |
| --------------- | ------------------------------------------------ |
| Language        | TypeScript (ESM, strict)                         |
| Effect system   | Effect v4 (`effect`, `@effect/platform-node`)    |
| HTTP client     | `@effect/platform` `HttpClient`                  |
| Schema          | Effect `Schema` / Zod                            |
| MCP SDK         | `@modelcontextprotocol/server` (stdio transport) |
| CLI             | `effect/unstable/cli` (already scaffolded)       |
| Build           | `tsdown` → ESM                                   |
| API docs source | Bruno `.bru` collections                         |

## Sources of Truth

1. **API docs** — `submodules/product-appsec-apidocs/main-api-collection/` — canonical. Bruno `.bru` files with method, URL, params, body, docs, response examples.
2. **OpenAPI specs** — Tokenizer, OSINT Scanner, DNS Twist microservices have live `/openapi.json`. Main API does not.
3. **Frontend types** — `.references/product-appsec-fe/packages/frontend/src/services/api/` — hand-written TS types for reference.

## .bru File Format

A Bruno `.bru` file is a custom DSL with blocks:

```
meta { name, type, seq }
get/post/put/patch/delete { url, body, auth }
params:path { key: value }
params:query { key: value }
body:json { JSON }
headers { key: value }
docs { free text docs }
example { name, request, response }
```

Parsable via `@usebruno/lang` (`bruToJsonV2`, `collectionBruToJson`).

## Target: Main API Surface

~27 feature areas, ~100 endpoints. Priority areas:

| Area                | Key Endpoints                                                  |
| ------------------- | -------------------------------------------------------------- |
| **ASM**             | List, Create, Get detail, Delete, Scan triggers, Findings list |
| **DAST**            | List, Create, Get, Scan triggers, Alerts list, Paths           |
| **SCA/SAST**        | List, Create, Get, Alerts list, Secrets list, GitHub status    |
| **Mobile Security** | List, Create, Get, Alerts                                      |
| **WAF**             | List, Create, Get, Scan, Results                               |
| **VPN/IoT Scanner** | List entries                                                   |
| **Alerts**          | List, Get, Update                                              |
| **Risk**            | Get by alert, Update, Team summary                             |
| **Summary**         | Issues, Assets, Vulnerabilities per type, Events               |
| **Account**         | Get/Update profile, 2FA channels                               |
| **Notification**    | List, Channels, Rules CRUD                                     |
| **API Manager**     | API keys CRUD, verify                                          |
| **Team**            | Create, Join, Members, Domains, Join requests                  |
| **Dictionary**      | Explain vulnerability                                          |
| **Report**          | Generate, Get report doc                                       |
| **Enrichment**      | Extract terms, Get definitions                                 |
| **LLM**             | List, Create, Get, Vulnerabilities                             |
| **News Directory**  | Team news, Keywords                                            |
| **Admin**           | Teams CRUD, Users CRUD, Subscriptions, Usage                   |

## Experimentation: Bruno at runtime (no codegen)

We skip build-time code generation (`scripts/codegen.ts` → `src/generated/*`). Full codegen into Effect Schemas and per-endpoint TS is high effort and brittle when `.bru` changes.

**Approach:** At MCP (or CLI) startup, load the Main API Bruno collection from disk, parse with `@usebruno/lang` (`bruToJsonV2` / `collectionBruToJson`), and build a **runtime registry**: method, URL template, path/query/body/header slots, optional `docs` / `example` text.

From that registry:

- **MCP:** Register tools dynamically (one tool per request, or grouped by folder if too many). Handlers interpolate params into the URL, attach JSON body when present, call `HttpClient`, return text + optional loose JSON for `structuredContent`.
- **Typing:** Prefer inference and small shared helpers over generated `Schema` types until specific endpoints need hardening.
- **Iteration:** Change `.bru` in `product-appsec-apidocs`, restart the server — no regenerate step.

Hand-written `src/api/*.ts` modules remain optional later for hot paths that deserve strict schemas and tests.

## Architecture

```
src/
├── api/                 # Effect-wrapped HTTP client for Main API
│   ├── client.ts        # Base client (base URL, JWT auth, error handling)
│   ├── asm.ts           # ASM endpoints
│   ├── dast.ts          # DAST endpoints
│   ├── scaSast.ts       # SCA/SAST endpoints
│   ├── alerts.ts
│   ├── risk.ts
│   ├── summary.ts
│   ├── account.ts
│   ├── admin.ts
│   ├── dictionary.ts
│   ├── enrichment.ts
│   ├── llm.ts
│   ├── mobile.ts
│   ├── notification.ts
│   ├── apiManager.ts
│   ├── team.ts
│   ├── vpn.ts
│   ├── iot.ts
│   ├── waf.ts
│   ├── report.ts
│   ├── news.ts
│   └── index.ts         # Re-exports all API modules
├── mcp/
│   └── server.ts        # MCP server: stdio transport; tools from runtime Bruno registry (+ optional manual tools)
├── runtime/
│   └── brunoRegistry.ts # Load & parse `.bru` collection → endpoint metadata + generic executor
├── cli.ts               # Extended CLI: all API operations as subcommands
├── main.ts              # Library exports
└── schemas/
    └── asm.ts           # (optional) Shared Zod schemas for request/response shapes
```

### API Client Layer (`src/api/`)

**Experimentation path:** a single shared `HttpClient` + envelope decode is enough; the Bruno registry’s generic executor calls into that. **Optional later:** per-area modules export typed Effect functions, e.g.:

```ts
// src/api/asm.ts
export const listAsmEntries = (teamId: string, params?: { offset?; limit?; sort?; order? }) =>
  Effect.request(HttpClient.get(`/asm/${teamId}`, { params })).pipe(
    Effect.flatMap(decodeResponse(ListAsmEntriesResponse)),
  )
```

- JWT token from config (env var, or pass in at startup)
- Consistent error handling: decode `{ statusCode, success, message, data }` envelope
- Stricter response decoding can come later from `.bru` `example` blocks or hand-written schemas where it pays off

### MCP Layer (`src/mcp/server.ts`)

```ts
import { McpServer } from "@modelcontextprotocol/server"

const mcp = new McpServer({ name: "noxtara-mcp", version: "0.1.0" })

// Either: loop `for (const ep of await loadBrunoRegistry())` and registerTool per endpoint
// Or: keep a few hand-written tools and add dynamic ones from the registry
mcp.registerTool("asm_list_entries", {
  description: "List ASM entries for a team",
  inputSchema: z.object({ teamId: z.string(), offset: z.number().optional(), ... })
}, async ({ teamId, ... }) => {
  const result = await listAsmEntries(teamId, ...)
  return { content: [{ type: "text", text: JSON.stringify(result) }] }
})
```

Registration is primarily **driven by the runtime Bruno registry** (tool name, description from `docs`, input shape from parsed params). A thin generic executor performs the HTTP call; hand-written `registerTool` stays possible for special cases. Output = `CallToolResult` with `content` (text) and optional `structuredContent`.

### CLI Layer (`src/cli.ts`)

Extend existing Effect CLI with subcommands mirroring the API modules:

```
noxtara asm list <teamId>
noxtara asm get <teamId> <entryId>
noxtara dast alerts <teamId> <entryId>
...
```

## Implementation Phases

### Phase 1 — Foundation

- [ ] Set up `product-appsec-apidocs` and `product-appsec-fe` as Git submodules (replacing `scripts/references.ts`).
- [ ] Install `@usebruno/lang` and `@modelcontextprotocol/server`.
- [ ] Implement `src/runtime/brunoRegistry.ts` — walk `main-api-collection`, parse `.bru` at startup, expose normalized endpoint list + generic `executeRequest(ep, args)`.
- [ ] Build `src/api/client.ts` — Effect `HttpClient` with JWT auth, base URL, error envelope handling (used by the generic executor).
- [ ] Prove the loop on ASM folder first (most complex, representative), then expand to full collection.

### Phase 2 — MCP Server

- [ ] Build `src/mcp/server.ts` — stdio transport, register tools from Bruno registry (ASM first), test
- [ ] Expand registry coverage to the rest of the Main API collection (same dynamic registration pattern)
- [ ] Handle auth: accept JWT token via env var or MCP config

### Phase 3 — CLI

- [ ] Extend `src/cli.ts` — either dispatch through the same Bruno registry as MCP, or add subcommands per area once typed `src/api/*` exists
- [ ] Reuse `src/api/client.ts` (and optional per-module helpers) so CLI and MCP share one HTTP stack

### Phase 4 — Polish

- [ ] Add remaining API areas (Admin, Notification, API Manager, Team, etc.)
- [ ] Output schemas (`structuredContent`) for structured tool results
- [ ] Error handling, pagination support
- [ ] Tests (via `@effect/vitest`)

## Key Design Decisions

1. **Auth**: Main API uses JWT Bearer token. Accept via `NOXTARA_JWT_TOKEN` env var. No login flow in v1.
2. **Team scoping**: Every tool accepts `teamId` as an explicit parameter rather than a global config.
3. **Response format**: Tool results return `{ content: [{ type: "text", text }], structuredContent: { ... } }` — structured for programmatic use, text for LLM readability.
4. **Error handling**: API errors (`success: false`) → `isError: true` in tool result, not MCP protocol errors (so LLM can see and self-correct).
