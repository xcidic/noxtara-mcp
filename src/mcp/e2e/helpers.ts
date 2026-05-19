import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  Client,
  StdioClientTransport,
  StreamableHTTPClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client"

import { sessionLog } from "../../debug/session-log.ts"
import { startNoxtaraMcpHttpServer } from "../server.ts"

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")

export const SAMPLE_TOOL = "account_2fa_get_all_channels"
export const SAMPLE_TOOL_PATH = "/account/me/tfa/channels"

export type MockApiServer = {
  baseUrl: string
  received: Array<{ method: string; url: string; headers: Record<string, string | undefined> }>
  close: () => Promise<void>
}

export const startMockApiServer = async (
  handler?: (
    req: IncomingMessage,
    res: ServerResponse,
    context: { basePath: string },
  ) => boolean | void,
): Promise<MockApiServer> => {
  const received: MockApiServer["received"] = []

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    const headers: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value
    }
    received.push({ method: req.method ?? "GET", url: url.pathname + url.search, headers })

    const handled = handler?.(req, res, { basePath: "/api/main" })
    if (handled === true) {
      return
    }

    if (req.method === "GET" && url.pathname === "/api/main/account/me/tfa/channels") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ channels: [{ id: "test-channel" }] }))
      return
    }

    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "not found", path: url.pathname }))
  })

  await listen(httpServer, 0, "127.0.0.1")

  const address = httpServer.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock API server")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/main`,
    received,
    close: () => closeServer(httpServer),
  }
}

export type McpHttpTestServer = Awaited<ReturnType<typeof startNoxtaraMcpHttpServer>>

export const connectMcpClient = async (mcpUrl: URL) => {
  const client = new Client({
    name: "noxtara-mcp-e2e",
    version: "0.0.1",
  })
  const transport = new StreamableHTTPClientTransport(mcpUrl)
  await client.connect(transport)
  return { client, transport }
}

export const mcpDirectEntrypoint = join(projectRoot, "src/mcp-direct.ts")

export const stdioServerEnv = (baseUrl: string, pat: string) => ({
  ...getDefaultEnvironment(),
  NOXTARA_API_BASE_URL: baseUrl,
  NOXTARA_PAT: pat,
  NOXTARA_DEBUG: process.env.NOXTARA_DEBUG ?? "1",
  DEBUG_RUN_ID: process.env.DEBUG_RUN_ID ?? "pre-fix",
})

export const connectStdioClient = async (options: {
  baseUrl: string
  pat?: string
  omitPat?: boolean
  testName: string
}) => {
  const connectStarted = performance.now()
  // #region agent log
  sessionLog({
    hypothesisId: "H3",
    location: "helpers.ts:connectStdioClient",
    message: "stdio connect started",
    data: { testName: options.testName, entrypoint: mcpDirectEntrypoint },
  })
  // #endregion

  const baseEnv = stdioServerEnv(options.baseUrl, options.pat ?? "unused")
  const env = options.omitPat
    ? Object.fromEntries(Object.entries(baseEnv).filter(([key]) => key !== "NOXTARA_PAT"))
    : baseEnv

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpDirectEntrypoint],
    env,
    cwd: projectRoot,
    stderr: "pipe",
  })

  const client = new Client({
    name: "noxtara-mcp-stdio-e2e",
    version: "0.0.1",
  })

  await client.connect(transport)

  // #region agent log
  sessionLog({
    hypothesisId: "H3",
    location: "helpers.ts:connectStdioClient",
    message: "stdio connect finished",
    data: {
      testName: options.testName,
      ms: Math.round(performance.now() - connectStarted),
      childPid: transport.pid,
    },
  })
  // #endregion

  return {
    client,
    transport,
    close: async () => {
      const closeStarted = performance.now()
      // #region agent log
      sessionLog({
        hypothesisId: "H2",
        location: "helpers.ts:connectStdioClient",
        message: "stdio close started",
        data: { testName: options.testName, childPid: transport.pid },
      })
      // #endregion

      await client.close()
      await transport.close()

      // #region agent log
      sessionLog({
        hypothesisId: "H2",
        location: "helpers.ts:connectStdioClient",
        message: "stdio close finished",
        data: {
          testName: options.testName,
          ms: Math.round(performance.now() - closeStarted),
          childPid: transport.pid,
        },
      })
      // #endregion
    },
  }
}

const listen = (server: Server, port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => resolve())
  })

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
