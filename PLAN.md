# Noxtara MCP — Plan

## Goal

Expose Noxtara (Product AppSec) Main API as:

- MCP tools (for AI agents)
- CLI commands (for humans)

while keeping implementation fast to iterate as Bruno docs evolve.

## Current Direction (MVP)

We are using:

**Bruno `.bru` -> parse -> IR -> tools**

and explicitly **not** doing an OpenAPI intermediary for Main API in v1.

### In scope now

- Dynamic parse of Bruno collection at startup
- Runtime IR generation per endpoint
- Dynamic MCP tool registration from IR
- Generic executor shared by MCP and CLI
- Dynamic **input schema** generation (Effect Schema + JSON Schema output for MCP)

### Out of scope now

- Output schema generation / strict response typing
- Tool-name normalization beyond minimum protocol-safe sanitizing
- Build-time codegen
- OpenAPI export/import pipeline for Main API

## Stack

| Concern         | Choice                                           |
| --------------- | ------------------------------------------------ |
| Language        | TypeScript (ESM, strict)                         |
| Effect system   | Effect v4 (`effect`, `@effect/platform-node`)    |
| HTTP client     | `@effect/platform` `HttpClient`                  |
| Schema          | Effect `Schema`                                  |
| MCP SDK         | `@modelcontextprotocol/server` (stdio transport) |
| CLI             | `effect/unstable/cli`                            |
| Build           | `tsdown` -> ESM                                  |
| API docs source | Bruno `.bru` collection                          |

## Sources of Truth

1. `submodules/product-appsec-apidocs/main-api-collection/` (canonical docs + examples)
2. Main API behavior itself (runtime responses)
3. Frontend references in `.references/product-appsec-fe` (optional hints)

## Bruno Notes

Bruno requests provide structured pieces we can map directly:

- meta: `name`, `type`, `seq`
- http: method, URL template, auth/body mode
- params: path/query params (with enabled flags and sample values)
- body blocks (`body:json`, etc.)
- headers
- docs
- examples

Important: examples are useful hints, but not strict contracts.

## IR Design (MVP)

Use a two-layer IR inspired by executor-style separation:

1. **Tool Definition IR (rich)**
   - name
   - description
   - input schema
   - execution metadata (method, URL template, params/body info)

2. **Execution Binding (lean)**
   - only data needed to execute HTTP call reliably
   - used by generic invoke path

This keeps registration concerns separate from invocation concerns.

## Runtime Flow

1. Parse collection + request files from `main-api-collection`
2. Extract endpoint IR rows
3. Build Effect input schemas dynamically
4. Convert input schemas to JSON schema for MCP registration
5. Register one MCP tool per request
6. Invoke through one generic HTTP executor
7. Return text-first results (+ optional raw structured payload)

## Architecture

```txt
src/
├── api/
│   └── client.ts          # shared HTTP client + auth + envelope/error mapping
├── runtime/
│   ├── bruno-parse.ts      # walk collection + parse .bru files
│   ├── bruno-extract.ts    # parse output -> IR
│   ├── bruno-schemas.ts    # dynamic Effect Schema builders (input only)
│   └── bruno-registry.ts   # IR registry + executor bindings
├── mcp/
│   └── server.ts          # register tools from runtime registry
├── cli.ts                 # dispatch using same registry/executor
└── main.ts
```

File splits can be adjusted, but these boundaries should hold.

## MCP Behavior (MVP)

- Tool count: one per Bruno request
- Tool description: `docs` first line, fallback to method + path
- Input schema: generated at runtime from params/body
- Output schema: omitted for now
- Response payload:
  - `content` text always present
  - optional raw JSON object in structured field if available
- API/business errors should be returned as tool errors (`isError: true`) rather than protocol failure when possible

## CLI Behavior (MVP)

- Reuse the same registry and generic executor
- Initial UX can be simple:
  - grouped commands by folder or direct operation path
- Fancy command ergonomics are phase-2

## Implementation Phases

### Phase 1 — Parse and IR

- [ ] Implement recursive `.bru` discovery for request files
- [ ] Parse each request with `@usebruno/lang`
- [ ] Build Tool Definition IR + Execution Binding
- [ ] Keep names close to Bruno (no big renaming strategy)

### Phase 2 — Dynamic Input Schemas

- [ ] Build Effect input schemas dynamically from:
  - path/query params
  - request body presence and mode
  - selected headers only if needed
- [ ] Export JSON schema documents for MCP registration
- [ ] Validate call arguments before execution

### Phase 3 — MCP Integration

- [ ] Implement `src/mcp/server.ts` dynamic registration loop
- [ ] Add generic invoke handler (`binding + args -> HTTP call`)
- [ ] Wire PAT auth via env (`NOXTARA_PAT`) with `x-pat` header
- [ ] Prove on ASM first, then expand to whole collection

### Phase 4 — CLI Integration

- [ ] Reuse registry/executor in CLI command surface
- [ ] Keep command UX minimal but discoverable

### Phase 5 — Hardening

- [ ] Improve envelope/error formatting consistency
- [ ] Add pagination helpers for common list endpoints
- [ ] Add tests for parser/extractor/schema generation
- [ ] Add optional output schema generation later (only where useful)

## Key Decisions

1. Main API source of truth is Bruno, not OpenAPI.
2. OpenAPI intermediary is deferred.
3. Input schemas now; output schemas later.
4. No name-normalization strategy in MVP.
5. Single generic executor first; area-specific typed clients are optional later.
6. `teamId` remains explicit in tool inputs for scoped operations.
