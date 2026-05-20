import { afterEach, describe, expect, it } from "vitest"

import { extractPatFromMcpPath, startNoxtaraMcpHttpServer } from "../server.ts"
import { SAMPLE_TOOL, connectMcpClient, startMockApiServer } from "./helpers.ts"

describe("MCP HTTP e2e", () => {
  const servers: Array<{ close: () => Promise<void> }> = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
  })

  it("requires PAT in the URL path", () => {
    expect(extractPatFromMcpPath("/mcp")).toMatchObject({
      status: 401,
      error: expect.stringContaining("Missing PAT"),
    })
    expect(extractPatFromMcpPath("/mcp/test-pat")).toEqual({ pat: "test-pat" })
    expect(extractPatFromMcpPath("/other")).toMatchObject({ status: 404 })
  })

  it("rejects MCP requests when PAT is missing from the path", async () => {
    const mockApi = await startMockApiServer()
    servers.push(mockApi)

    const mcp = await startNoxtaraMcpHttpServer({ baseUrl: mockApi.baseUrl })
    servers.push(mcp)

    const response = await fetch(new URL("/mcp", mcp.mcpUrl))
    expect(response.status).toBe(401)
    expect(await response.text()).toContain("Missing PAT")
  })

  it("allows multiple clients to initialize against the same server", async () => {
    const mockApi = await startMockApiServer()
    servers.push(mockApi)

    const mcp = await startNoxtaraMcpHttpServer({ baseUrl: mockApi.baseUrl })
    servers.push(mcp)

    const base = new URL(mcp.mcpUrl)
    const patA = new URL(base)
    patA.pathname = `/mcp/${encodeURIComponent("pat-a")}`
    const patB = new URL(base)
    patB.pathname = `/mcp/${encodeURIComponent("pat-b")}`

    const clientA = await connectMcpClient(patA)
    const clientB = await connectMcpClient(patB)
    servers.push({
      close: async () => {
        await clientA.transport.close()
        await clientA.client.close()
        await clientB.transport.close()
        await clientB.client.close()
      },
    })

    const [toolsA, toolsB] = await Promise.all([
      clientA.client.listTools(),
      clientB.client.listTools(),
    ])

    expect(toolsA.tools.length).toBeGreaterThan(100)
    expect(toolsB.tools.length).toBe(toolsA.tools.length)
    expect(clientA.client.getServerVersion()?.name).toBe("noxtara-mcp")
    expect(clientB.client.getServerVersion()?.name).toBe("noxtara-mcp")
  })

  it("initializes and lists OpenAPI-derived tools", async () => {
    const mockApi = await startMockApiServer()
    servers.push(mockApi)

    const mcp = await startNoxtaraMcpHttpServer({
      baseUrl: mockApi.baseUrl,
      pat: "e2e-pat",
    })
    servers.push(mcp)

    const { client, transport } = await connectMcpClient(mcp.mcpUrl)
    servers.push({
      close: async () => {
        await transport.close()
        await client.close()
      },
    })

    const serverInfo = client.getServerVersion()
    expect(serverInfo?.name).toBe("noxtara-mcp")

    const tools = await client.listTools()
    expect(tools.tools.length).toBeGreaterThan(100)
    expect(tools.tools.some((tool) => tool.name === SAMPLE_TOOL)).toBe(true)

    const sample = tools.tools.find((tool) => tool.name === SAMPLE_TOOL)
    expect(sample?.description).toBeTruthy()
    expect(sample?.inputSchema).toBeDefined()
  })

  it("invokes a tool with PAT from the URL and forwards x-pat to the API", async () => {
    const mockApi = await startMockApiServer()
    servers.push(mockApi)

    const mcp = await startNoxtaraMcpHttpServer({
      baseUrl: mockApi.baseUrl,
      pat: "e2e-pat-123",
    })
    servers.push(mcp)

    const { client, transport } = await connectMcpClient(mcp.mcpUrl)
    servers.push({
      close: async () => {
        await transport.close()
        await client.close()
      },
    })

    const result = await client.callTool({
      name: SAMPLE_TOOL,
      arguments: {},
    })

    expect(result.isError).toBeFalsy()
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("test-channel"),
    })

    const apiCall = mockApi.received.find(
      (entry) => entry.method === "GET" && entry.url.includes("/account/me/tfa/channels"),
    )
    expect(apiCall).toBeDefined()
    expect(apiCall?.headers["x-pat"]).toBe("e2e-pat-123")
  })

  it("rejects unknown tools at the MCP protocol layer", async () => {
    const mockApi = await startMockApiServer()
    servers.push(mockApi)

    const mcp = await startNoxtaraMcpHttpServer({ baseUrl: mockApi.baseUrl })
    servers.push(mcp)

    const { client, transport } = await connectMcpClient(mcp.mcpUrl)
    servers.push({
      close: async () => {
        await transport.close()
        await client.close()
      },
    })

    await expect(
      client.callTool({
        name: "definitely_not_a_real_operation_id",
        arguments: {},
      }),
    ).rejects.toThrow(/not found/i)

    const tools = await client.listTools()
    expect(tools.tools.length).toBeGreaterThan(0)
  })

  it("surfaces API failures as tool errors", async () => {
    const mockApi = await startMockApiServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      if (req.method === "GET" && url.pathname === "/api/main/account/me/tfa/channels") {
        res.writeHead(500, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "upstream failed" }))
        return true
      }
      return false
    })
    servers.push(mockApi)

    const mcp = await startNoxtaraMcpHttpServer({ baseUrl: mockApi.baseUrl })
    servers.push(mcp)

    const { client, transport } = await connectMcpClient(mcp.mcpUrl)
    servers.push({
      close: async () => {
        await transport.close()
        await client.close()
      },
    })

    const result = await client.callTool({
      name: SAMPLE_TOOL,
      arguments: {},
    })

    expect(result.isError).toBe(true)
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("upstream failed"),
    })
  })
})

describe("MCP HTTP path auth", () => {
  it("decodes PAT segments in the URL", () => {
    expect(extractPatFromMcpPath("/mcp/pat%2Fwith%2Fslashes")).toEqual({
      pat: "pat/with/slashes",
    })
  })
})
