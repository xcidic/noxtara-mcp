import {
  asString,
  isRecord,
  parseBrunoCollection,
  parseDocs,
  sanitizeOperationId,
  splitUrlTemplate,
} from "./bruno-collection.ts"
import { buildRequestBody, inferParamSchema } from "./json-schema-infer.ts"

const DEFAULT_SERVER_URL = "https://dev.appsec.xcidic.com/api/main"

const tagFromRelativePath = (relativePath: string) => {
  const segment = relativePath.replace(/\\/g, "/").split("/")[0]
  return segment?.replace(/^\[.*?\]\s*/, "").trim() || "default"
}

export const brunoCollectionToOpenApi = () => {
  const collection = parseBrunoCollection()
  const paths: Record<string, Record<string, unknown>> = {}
  const usedOperationIds = new Map<string, number>()

  for (const request of collection.requests) {
    const parsed = request.parsed
    const http = isRecord(parsed.http) ? parsed.http : {}
    const meta = isRecord(parsed.meta) ? parsed.meta : {}
    const body = isRecord(parsed.body) ? parsed.body : {}
    const docs = parseDocs(parsed.docs)

    const method = (asString(http.method) ?? "get").toLowerCase()
    const urlTemplate = asString(http.url) ?? ""
    const bodyMode = asString(http.body)
    const { pathTemplate, queryDefaults } = splitUrlTemplate(urlTemplate)

    const parameters: Array<Record<string, unknown>> = []
    const params = Array.isArray(parsed.params) ? parsed.params.filter(isRecord) : []

    for (const param of params) {
      const name = asString(param.name)
      const location = asString(param.type)
      if (!name || (location !== "path" && location !== "query")) continue
      if (param.enabled === false) continue

      parameters.push({
        name,
        in: location,
        required: location === "path",
        schema: inferParamSchema(param.value),
        ...(location === "query" && param.value !== undefined ? { example: param.value } : {}),
      })
    }

    for (const [name, value] of Object.entries(queryDefaults)) {
      if (parameters.some((p) => p.name === name && p.in === "query")) {
        continue
      }
      parameters.push({
        name,
        in: "query",
        required: false,
        schema: inferParamSchema(value),
        example: value,
      })
    }

    const requestBody = buildRequestBody(bodyMode, body)

    let operationId = sanitizeOperationId(request.relativePath, method)
    const count = usedOperationIds.get(operationId) ?? 0
    usedOperationIds.set(operationId, count + 1)
    if (count > 0) {
      operationId = `${operationId}_${count + 1}`
    }

    const summary = asString(meta.name) ?? request.relativePath.replace(/\.bru$/i, "")
    const description = docs?.trim() || undefined
    const tag = tagFromRelativePath(request.relativePath)

    const operation: Record<string, unknown> = {
      operationId,
      summary,
      ...(description ? { description } : {}),
      tags: [tag],
      parameters,
      ...(requestBody ? { requestBody } : {}),
      responses: {
        default: {
          description: "Response",
        },
      },
    }

    const pathItem = paths[pathTemplate] ?? {}
    if (pathItem[method]) {
      operation.operationId = `${operationId}_dup`
    }
    pathItem[method] = operation
    paths[pathTemplate] = pathItem
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Noxtara Main API",
      version: "1.0.0",
      description: "Generated from Bruno main-api-collection (examples stripped).",
    },
    servers: [{ url: DEFAULT_SERVER_URL, description: "Noxtara Main API (dev default)" }],
    paths,
    components: { schemas: {} },
  }
}
