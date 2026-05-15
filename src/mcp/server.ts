import { McpServer, StdioServerTransport, fromJsonSchema } from "@modelcontextprotocol/server"

import { createBrunoRegistry } from "../runtime/bruno-registry.ts"

const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const createNoxtaraMcpServer = (options?: {
  baseUrl?: string
  pat?: string
}) => {
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
      async (args) => {
        try {
          const invokeOptions = options?.pat ? { pat: options.pat } : undefined
          return await registry.invokeTool(tool.name, args ?? {}, invokeOptions)
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: formatError(error) }],
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

export const serveNoxtaraMcp = async (options?: {
  baseUrl?: string
  pat?: string
}) => {
  const { server } = createNoxtaraMcpServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
