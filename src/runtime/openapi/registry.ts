import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { sessionLog } from "../../debug/session-log.ts"
import { extract } from "./extract.ts"
import { invokeWithLayer } from "./invoke.ts"
import { parse } from "./parse.ts"
import { limitToolName } from "./tool-name.ts"
import type { ExtractedOperation, OperationBinding } from "./types.ts"

export const DEFAULT_API_BASE_URL = "https://dev.appsec.xcidic.com/api/main"
const DEFAULT_SPEC_RELATIVE = "specs/main-api.openapi.json"

const findSpecPath = (startDir: string, specRelative = DEFAULT_SPEC_RELATIVE) => {
  let dir = startDir
  while (true) {
    const candidate = join(dir, specRelative)
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  throw new Error(
    `OpenAPI spec not found (looked for ${specRelative} from ${startDir}). Run pnpm run generate:openapi.`,
  )
}

const toInputJsonSchema = (inputSchema: unknown) => {
  if (typeof inputSchema === "object" && inputSchema !== null && !Array.isArray(inputSchema)) {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...(inputSchema as Record<string, unknown>),
    }
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {},
    additionalProperties: false,
  }
}

const toBinding = (operation: ExtractedOperation): OperationBinding => ({
  method: operation.method,
  pathTemplate: operation.pathTemplate,
  parameters: operation.parameters,
  requestBody: operation.requestBody,
})

type RegistryTool = {
  name: string
  displayName: string
  description: string
  tags: readonly string[]
  inputJsonSchema: unknown
  binding: OperationBinding
}

type OpenApiRegistry = {
  specPath: string
  operationCount: number
  baseUrl: string
  tools: RegistryTool[]
  getTool: (name: string) => RegistryTool | undefined
  listTools: () => Array<{
    name: string
    displayName: string
    description: string
    tags: readonly string[]
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

let cachedRegistry: OpenApiRegistry | undefined

const resolveBaseUrl = (overrideBaseUrl: string | undefined) => {
  const fromEnv = process.env.NOXTARA_API_BASE_URL
  return overrideBaseUrl ?? fromEnv ?? DEFAULT_API_BASE_URL
}

const loadRegistry = (specPath: string, baseUrl: string): OpenApiRegistry => {
  const loadStarted = performance.now()
  // #region agent log
  sessionLog({
    hypothesisId: "H1",
    location: "registry.ts:loadRegistry",
    message: "load started",
    data: { specPath, baseUrl },
  })
  // #endregion

  const text = readFileSync(specPath, "utf8")
  const parseStarted = performance.now()
  const doc = Effect.runSync(parse(text))
  // #region agent log
  sessionLog({
    hypothesisId: "H1",
    location: "registry.ts:loadRegistry",
    message: "parse done",
    data: { ms: Math.round(performance.now() - parseStarted) },
  })
  // #endregion

  const extractStarted = performance.now()
  const extraction = Effect.runSync(extract(doc))
  // #region agent log
  sessionLog({
    hypothesisId: "H1",
    location: "registry.ts:loadRegistry",
    message: "extract done",
    data: {
      ms: Math.round(performance.now() - extractStarted),
      operations: extraction.operations.length,
    },
  })
  // #endregion

  const toolEntries = extraction.operations
    .filter((operation) => !operation.deprecated)
    .map((operation) => {
      const description =
        Option.getOrUndefined(operation.description) ??
        Option.getOrUndefined(operation.summary) ??
        `${operation.method.toUpperCase()} ${operation.pathTemplate}`

      const operationId = String(operation.operationId)
      const toolName = limitToolName(operationId)

      return {
        name: toolName,
        displayName: Option.getOrUndefined(operation.summary) ?? operationId,
        description,
        tags: [...operation.tags],
        inputJsonSchema: toInputJsonSchema(Option.getOrUndefined(operation.inputSchema)),
        binding: toBinding(operation),
      }
    })

  const toolByName = new Map(toolEntries.map((entry) => [entry.name, entry]))

  // #region agent log
  sessionLog({
    hypothesisId: "H1",
    location: "registry.ts:loadRegistry",
    message: "load finished",
    data: {
      ms: Math.round(performance.now() - loadStarted),
      toolCount: toolEntries.length,
    },
  })
  // #endregion

  return {
    specPath,
    operationCount: toolEntries.length,
    baseUrl,
    tools: toolEntries,
    getTool: (name: string) => toolByName.get(name),
    listTools: () =>
      toolEntries.map((tool) => ({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        tags: tool.tags,
        inputJsonSchema: tool.inputJsonSchema,
      })),
    invokeTool: (name: string, rawArgs: unknown, invokeOptions?: { pat?: string }) => {
      const invokeStarted = performance.now()
      // #region agent log
      sessionLog({
        hypothesisId: "H4",
        location: "registry.ts:invokeTool",
        message: "invoke started",
        data: {
          tool: name,
          baseUrl,
          hasPat: Boolean(invokeOptions?.pat ?? process.env.NOXTARA_PAT),
        },
      })
      // #endregion

      const tool = toolByName.get(name)
      if (!tool) {
        throw new Error(`Unknown tool "${name}"`)
      }

      const pat = invokeOptions?.pat ?? process.env.NOXTARA_PAT
      if (!pat) {
        throw new Error("Missing PAT. Set NOXTARA_PAT to authenticate API requests.")
      }

      const args =
        typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
          ? (rawArgs as Record<string, unknown>)
          : {}

      return Effect.runPromise(
        invokeWithLayer(
          tool.binding,
          args,
          baseUrl,
          { "x-pat": pat },
          {},
          NodeHttpClient.layerUndici,
          { tool: name },
        ).pipe(
          Effect.map((response) => {
            const payload = response.data ?? response.error
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
              isError: response.status < 200 || response.status >= 300,
              content: [
                {
                  type: "text" as const,
                  text:
                    typeof payload === "string"
                      ? payload
                      : JSON.stringify(payload ?? null, null, 2),
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
          Effect.tap(() =>
            Effect.sync(() =>
              sessionLog({
                hypothesisId: "H4",
                location: "registry.ts:invokeTool",
                message: "invoke finished",
                data: {
                  tool: name,
                  ms: Math.round(performance.now() - invokeStarted),
                },
              }),
            ),
          ),
        ),
      )
    },
  }
}

export const createOpenApiRegistry = (options?: {
  baseUrl?: string
  specPath?: string
  forceReload?: boolean
}): OpenApiRegistry => {
  if (!options?.forceReload && cachedRegistry) {
    return cachedRegistry
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const specPath = options?.specPath ?? findSpecPath(join(moduleDir, "../../.."))
  const baseUrl = resolveBaseUrl(options?.baseUrl)
  const registry = loadRegistry(specPath, baseUrl)
  cachedRegistry = registry
  return registry
}
