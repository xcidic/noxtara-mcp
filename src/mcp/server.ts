import { createServer } from "node:http"

import {
  McpServer,
  StdioServerTransport,
  WebStandardStreamableHTTPServerTransport,
  fromJsonSchema,
} from "@modelcontextprotocol/server"

import { createBrunoRegistry } from "../runtime/bruno-registry.ts"

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

const extractPatFromMcpPath = (
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

export const createNoxtaraMcpServer = (options?: { baseUrl?: string; pat?: string }) => {
  const registryOptions = options?.baseUrl ? { baseUrl: options.baseUrl } : undefined
  const registry = createBrunoRegistry(registryOptions)

  const server = new McpServer({
    name: "noxtara-mcp",
    version: "0.0.1",
  })

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

export const serveNoxtaraMcpHttp = async (options?: {
  baseUrl?: string
  pat?: string
  port?: number
}) => {
  const { server: mcpServer } = createNoxtaraMcpServer(options)
  const port = options?.port ?? 3434

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })
  await mcpServer.connect(transport)

  const httpServer = createServer(async (req, res) => {
    try {
      const body = await readBody(req)
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
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

  return new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      console.error(`MCP HTTP server listening on http://localhost:${port}/mcp/<pat>`)
      resolve()
    })
  })
}
