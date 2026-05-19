import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import * as Effect from "effect/Effect"
import { afterEach, describe, expect, it } from "vitest"

import { extract } from "./extract.ts"
import { createOpenApiRegistry } from "./registry.ts"
import { parse } from "./parse.ts"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const specPath = join(projectRoot, "specs/main-api.openapi.json")

const ORIGINAL_PAT = process.env.NOXTARA_PAT

afterEach(() => {
  if (ORIGINAL_PAT === undefined) {
    delete process.env.NOXTARA_PAT
    return
  }
  process.env.NOXTARA_PAT = ORIGINAL_PAT
})

describe("OpenAPI registry", () => {
  it("loads the committed main API spec", () => {
    expect(existsSync(specPath)).toBe(true)

    const registry = createOpenApiRegistry({ specPath, forceReload: true })
    expect(registry.operationCount).toBeGreaterThan(0)
    expect(registry.tools.length).toBe(registry.operationCount)
    expect(registry.tools.some((tool) => tool.name.includes("asm"))).toBe(true)
  })

  it("parses and extracts operations from the spec file", () => {
    const text = readFileSync(specPath, "utf8")
    const doc = Effect.runSync(parse(text))
    const result = Effect.runSync(extract(doc))

    expect(result.operations.length).toBeGreaterThan(0)
    expect(result.operations[0]?.operationId).toBeTruthy()
  })

  it("requires NOXTARA_PAT before invoking tools", () => {
    delete process.env.NOXTARA_PAT

    const registry = createOpenApiRegistry({ specPath, forceReload: true })
    const toolName = registry.tools[0]?.name
    expect(toolName).toBeDefined()
    if (!toolName) {
      throw new Error("Expected at least one tool")
    }

    expect(() => registry.invokeTool(toolName, {})).toThrow(
      "Missing PAT. Set NOXTARA_PAT to authenticate API requests.",
    )
  })
})
