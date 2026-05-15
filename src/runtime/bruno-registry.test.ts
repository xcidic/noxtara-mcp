import { afterEach, describe, expect, it } from "vitest"

import { createBrunoRegistry } from "./bruno-registry.ts"
import { parseBrunoCollection } from "./bruno-parse.ts"

const ORIGINAL_PAT = process.env.NOXTARA_PAT

afterEach(() => {
  if (ORIGINAL_PAT === undefined) {
    delete process.env.NOXTARA_PAT
    return
  }
  process.env.NOXTARA_PAT = ORIGINAL_PAT
})

describe("Bruno runtime scope", () => {
  it("parses the main API collection by default", () => {
    const collection = parseBrunoCollection()

    expect(collection.collectionDir).toContain("submodules/product-appsec-apidocs/main-api-collection")
    expect(collection.requestCount).toBeGreaterThan(0)
  }, 60_000)
})

describe("Bruno runtime authentication", () => {
  it("requires NOXTARA_PAT before invoking tools", () => {
    delete process.env.NOXTARA_PAT

    const registry = createBrunoRegistry({ forceReload: true })
    const publicTool = registry.tools.find((tool) => {
      const required = Reflect.get(tool.inputJsonSchema as object, "required")
      return !Array.isArray(required) || required.length === 0
    })

    const toolName = publicTool?.name
    expect(toolName).toBeDefined()
    if (!toolName) {
      throw new Error("Expected a tool with optional input schema")
    }

    expect(() => registry.invokeTool(toolName, {})).toThrow(
      "Missing PAT. Set NOXTARA_PAT to authenticate API requests.",
    )
  }, 60_000)
})
