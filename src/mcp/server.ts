import { createServer } from "node:http"

import {
  McpServer,
  StdioServerTransport,
  WebStandardStreamableHTTPServerTransport,
  fromJsonSchema,
} from "@modelcontextprotocol/server"

import { sessionLog } from "../debug/session-log.ts"
import { createOpenApiRegistry } from "../runtime/openapi/registry.ts"

const readBody = (req: import("node:http").IncomingMessage): Promise<Uint8Array | undefined> => {
  if (req.method === "GET" || req.method === "HEAD") return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined))
    req.on("error", reject)
  })
}

const toWebHeaders = (nodeHeaders: import("node:http").IncomingHttpHeaders): Headers => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

export const extractPatFromMcpPath = (
  pathname: string,
): { pat: string } | { status: number; error: string } => {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "mcp") {
    return { status: 404, error: "Not Found" }
  }
  if (parts.length !== 2 || !parts[1]) {
    return { status: 401, error: "Missing PAT in MCP path. Use /mcp/<pat>." }
  }
  return { pat: decodeURIComponent(parts[1]) }
}

export const createNoxtaraMcpServer = (options?: {
  baseUrl?: string
  pat?: string
  forceReload?: boolean
}) => {
  const createStarted = performance.now()
  // #region agent log
  sessionLog({
    hypothesisId: "H1",
    location: "server.ts:createNoxtaraMcpServer",
    message: "create started",
    data: {
      hasBaseUrl: Boolean(options?.baseUrl),
      forceReload: options?.forceReload ?? Boolean(options?.baseUrl),
    },
  })
  // #endregion

  const registry = createOpenApiRegistry(
    options?.baseUrl || options?.forceReload
      ? {
          ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
          forceReload: options.forceReload ?? Boolean(options.baseUrl),
        }
      : undefined,
  )

  const server = new McpServer({
    name: "noxtara-mcp",
    version: "0.0.1",
  })

  const registerStarted = performance.now()
  for (const tool of registry.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.displayName,
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputJsonSchema),
      },
      async (args, ctx) => {
        try {
          const pat = ctx.http?.authInfo?.token ?? options?.pat
          const invokeOptions = pat ? { pat } : undefined
          return await registry.invokeTool(tool.name, args ?? {}, invokeOptions)
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: error instanceof Error ? error.message : String(error),
              },
            ],
          }
        }
      },
    )
  }

  // #region agent log
  sessionLog({
    hypothesisId: "H1",
    location: "server.ts:createNoxtaraMcpServer",
    message: "tools registered",
    data: {
      registerMs: Math.round(performance.now() - registerStarted),
      totalMs: Math.round(performance.now() - createStarted),
      toolCount: registry.tools.length,
    },
  })
  // #endregion

  return {
    server,
    registry,
  }
}

export const serveNoxtaraMcp = async (options?: { baseUrl?: string; pat?: string }) => {
  const { server } = createNoxtaraMcpServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

const pipeWebResponseToNode = async (
  webResponse: Response,
  res: import("node:http").ServerResponse,
) => {
  const statusText = webResponse.statusText || undefined
  res.writeHead(webResponse.status, statusText, Object.fromEntries(webResponse.headers))

  if (webResponse.body) {
    const reader = webResponse.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          return
        }
        res.write(value)
      }
    } catch {
      res.end()
    }
  } else {
    res.end()
  }
}

export const startNoxtaraMcpHttpServer = async (options?: {
  baseUrl?: string
  pat?: string
  port?: number
  host?: string
}) => {
  const { server: mcpServer, registry } = createNoxtaraMcpServer(options)
  const pat = options?.pat ?? "mcp-pat"
  const host = options?.host ?? "127.0.0.1"

  // Stateless: no sessionIdGenerator — multiple clients can initialize on one transport.
  const transport = new WebStandardStreamableHTTPServerTransport()
  await mcpServer.connect(transport)

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`)
      console.error(`[HTTP] ${req.method} ${url.pathname} - headers:`, JSON.stringify(req.headers))

      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ status: "ok" }))
        return
      }

      const body = await readBody(req)
      const pathAuth = extractPatFromMcpPath(url.pathname)
      if ("error" in pathAuth) {
        res.writeHead(pathAuth.status)
        res.end(pathAuth.error)
        return
      }

      const webResponse = await transport.handleRequest(
        new Request(url, {
          method: req.method ?? "GET",
          headers: toWebHeaders(req.headers),
          body: body ?? null,
        }),
        {
          authInfo: {
            token: pathAuth.pat,
            clientId: "url-pat",
            scopes: [],
          },
        },
      )

      await pipeWebResponseToNode(webResponse, res)
    } catch (error) {
      console.error(error)
      res.writeHead(500)
      res.end("Internal Server Error")
    }
  })

  const port = options?.port ?? 0
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(port, host, () => resolve())
  })

  const address = httpServer.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind MCP HTTP server")
  }

  const mcpUrl = new URL(`http://${host}:${address.port}/mcp/${encodeURIComponent(pat)}`)

  return {
    mcpUrl,
    pat,
    registry,
    httpServer,
    close: async () => {
      await transport.close()
      await mcpServer.close()
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

export const serveNoxtaraMcpHttp = async (options?: {
  baseUrl?: string
  pat?: string
  port?: number
}) => {
  const { mcpUrl, close } = await startNoxtaraMcpHttpServer({
    ...options,
    host: "0.0.0.0",
    port: options?.port ?? 3434,
  })
  console.error(`MCP HTTP server listening on ${mcpUrl.origin}/mcp/<pat>`)
  process.on("SIGINT", () => {
    void close()
  })
}
