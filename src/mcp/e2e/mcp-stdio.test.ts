import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { SAMPLE_TOOL, connectStdioClient, startMockApiServer } from "./helpers.ts"

describe("MCP stdio e2e", () => {
  let sharedMockApi: Awaited<ReturnType<typeof startMockApiServer>>
  let sharedClient: Awaited<ReturnType<typeof connectStdioClient>>["client"]
  let closeShared: () => Promise<void>

  beforeAll(async () => {
    sharedMockApi = await startMockApiServer()
    const session = await connectStdioClient({
      baseUrl: sharedMockApi.baseUrl,
      pat: "stdio-shared-pat",
      testName: "shared-session",
    })
    sharedClient = session.client
    closeShared = session.close
  }, 60_000)

  afterAll(async () => {
    await closeShared?.()
    await sharedMockApi?.close()
  }, 60_000)

  describe("shared stdio session", () => {
    it("lists OpenAPI-derived tools", async () => {
      const tools = await sharedClient.listTools()
      expect(tools.tools.length).toBeGreaterThan(100)
      expect(tools.tools.some((tool) => tool.name === SAMPLE_TOOL)).toBe(true)
    })

    it("invokes a tool using NOXTARA_PAT from the child env", async () => {
      const result = await sharedClient.callTool({
        name: SAMPLE_TOOL,
        arguments: {},
      })

      expect(result.isError).toBeFalsy()
      expect(result.content?.[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("test-channel"),
      })

      const apiCall = sharedMockApi.received.find(
        (entry) => entry.method === "GET" && entry.url.includes("/account/me/tfa/channels"),
      )
      expect(apiCall?.headers["x-pat"]).toBe("stdio-shared-pat")
    })
  })

  describe("stdio without PAT", () => {
    const cleanups: Array<() => Promise<void>> = []

    afterEach(async () => {
      await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
    })

    it("returns a tool error when NOXTARA_PAT is not set", async () => {
      const mockApi = await startMockApiServer()
      cleanups.push(mockApi.close)

      const { client, close } = await connectStdioClient({
        baseUrl: mockApi.baseUrl,
        omitPat: true,
        testName: "missing-pat",
      })
      cleanups.push(close)

      const result = await client.callTool({
        name: SAMPLE_TOOL,
        arguments: {},
      })

      expect(result.isError).toBe(true)
      expect(result.content?.[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Missing PAT"),
      })
    })
  })
})
