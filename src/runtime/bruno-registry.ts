import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { invokeHttpBinding } from "../api/client.ts"
import { extractBrunoTools } from "./bruno-extract.ts"
import { parseBrunoCollection } from "./bruno-parse.ts"

const renderPayload = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)

const resolveBaseUrl = (
  collectionBaseUrl: string | undefined,
  overrideBaseUrl: string | undefined,
) => {
  const fromEnv = process.env.NOXTARA_API_BASE_URL
  const candidate = overrideBaseUrl ?? fromEnv ?? collectionBaseUrl
  if (!candidate) {
    throw new Error(
      "No API base URL found. Set NOXTARA_API_BASE_URL or define API_BASE_URL in collection.bru.",
    )
  }
  return candidate
}

const decodeInput = (schema: Schema.Top, args: unknown) => {
  const decode = Schema.decodeUnknownSync(schema as never)
  return decode(args)
}

type RegistryTool = ReturnType<typeof extractBrunoTools>[number]

type BrunoRegistry = {
  collectionDir: string
  requestCount: number
  baseUrl: string
  tools: Array<RegistryTool>
  getTool: (name: string) => RegistryTool | undefined
  listTools: () => Array<{
    name: string
    displayName: string
    description: string
    sourcePath: string
    inputJsonSchema: unknown
  }>
  invokeTool: (
    name: string,
    rawArgs: unknown,
    invokeOptions?: { pat?: string },
  ) => Promise<{
    isError: boolean
    content: Array<{ type: "text"; text: string }>
    structuredContent?: Record<string, unknown>
    raw: {
      status: number
      headers: Record<string, string>
      data: unknown
      error: unknown
    }
  }>
}

let cachedRegistry: BrunoRegistry | undefined

export const createBrunoRegistry = (options?: {
  baseUrl?: string
  forceReload?: boolean
}): BrunoRegistry => {
  if (!options?.forceReload && cachedRegistry) {
    return cachedRegistry
  }

  const collection = parseBrunoCollection()
  const toolEntries = extractBrunoTools(collection)
  const toolByName = new Map(toolEntries.map((entry) => [entry.name, entry]))
  const baseUrl = resolveBaseUrl(collection.apiBaseUrlTemplate, options?.baseUrl)

  const registry = {
    collectionDir: collection.collectionDir,
    requestCount: collection.requestCount,
    baseUrl,
    tools: toolEntries,
    getTool: (name: string) => toolByName.get(name),
    listTools: () =>
      toolEntries.map((tool) => ({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        sourcePath: tool.sourcePath,
        inputJsonSchema: tool.inputJsonSchema,
      })),
    invokeTool: (name: string, rawArgs: unknown, invokeOptions?: { pat?: string }) => {
      const tool = toolByName.get(name)
      if (!tool) {
        throw new Error(`Unknown tool "${name}"`)
      }

      const args = decodeInput(tool.inputSchema, rawArgs)
      const pat = invokeOptions?.pat ?? process.env.NOXTARA_PAT
      if (!pat) {
        throw new Error("Missing PAT. Set NOXTARA_PAT to authenticate API requests.")
      }
      const requestOptions = { baseUrl, pat }
      const { bodyMode, ...restBinding } = tool.binding
      const binding = bodyMode ? { ...restBinding, bodyMode } : restBinding

      return Effect.runPromise(
        invokeHttpBinding(binding, args, requestOptions).pipe(
          Effect.map((response) => {
            const payload = response.ok ? response.data : response.error
            const structuredContent =
              typeof payload === "object" && payload !== null && !Array.isArray(payload)
                ? (payload as Record<string, unknown>)
                : undefined
            const result: {
              isError: boolean
              content: Array<{ type: "text"; text: string }>
              raw: {
                status: number
                headers: Record<string, string>
                data: unknown
                error: unknown
              }
              structuredContent?: Record<string, unknown>
            } = {
              isError: !response.ok,
              content: [
                {
                  type: "text" as const,
                  text: renderPayload(payload),
                },
              ],
              raw: {
                status: response.status,
                headers: response.headers,
                data: response.data,
                error: response.error,
              },
            }
            if (structuredContent) {
              result.structuredContent = structuredContent
            }
            return result
          }),
        ),
      )
    },
  }

  cachedRegistry = registry
  return registry
}
