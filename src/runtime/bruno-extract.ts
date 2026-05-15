import { buildInputSchema } from "./bruno-schemas.ts"
import { parseBrunoCollection } from "./bruno-parse.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

const parseDocs = (value: unknown) => {
  if (typeof value === "string") {
    return value
  }
  if (isRecord(value) && typeof value.trim === "function" && typeof value.split === "function") {
    const lines = value.split("\n")
    if (Array.isArray(lines) && lines.every((line) => typeof line === "string")) {
      return lines.join("\n")
    }
  }
  return undefined
}

const firstLine = (text: string | undefined) => text?.trim().split("\n")[0]?.trim()

const sanitizeToolName = (name: string) => {
  const normalized = name
    .toLowerCase()
    .replace(/\.bru$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (!normalized) {
    return "request"
  }
  return /^[a-z]/.test(normalized) ? normalized : `tool_${normalized}`
}

const splitUrlTemplate = (urlTemplate: string, apiBaseUrlTemplate: string | undefined) => {
  const [withoutQuery, queryString] = urlTemplate.split("?")
  const rawPath = withoutQuery ?? ""
  const rawQuery = queryString ?? ""

  let pathTemplate = rawPath
  if (apiBaseUrlTemplate && pathTemplate.startsWith(apiBaseUrlTemplate)) {
    pathTemplate = pathTemplate.slice(apiBaseUrlTemplate.length)
  } else {
    pathTemplate = pathTemplate.replace(/^{{[^}]+}}/, "")
  }

  if (!pathTemplate.startsWith("/")) {
    pathTemplate = `/${pathTemplate}`
  }

  const queryDefaults: Record<string, string> = {}
  if (rawQuery) {
    for (const [key, value] of new URLSearchParams(rawQuery)) {
      queryDefaults[key] = value
    }
  }

  return {
    pathTemplate: pathTemplate.replaceAll(/:([A-Za-z0-9_]+)/g, "{$1}"),
    queryDefaults,
  }
}

export const extractBrunoTools = (collection: ReturnType<typeof parseBrunoCollection>) => {
  const tools = []
  const usedNames = new Map<string, number>()

  for (const request of collection.requests) {
    const parsed = request.parsed
    const http = isRecord(parsed.http) ? parsed.http : {}
    const meta = isRecord(parsed.meta) ? parsed.meta : {}
    const body = isRecord(parsed.body) ? parsed.body : {}
    const docs = parseDocs(parsed.docs)

    const method = asString(http.method)?.toUpperCase() ?? "GET"
    const urlTemplate = asString(http.url) ?? ""
    const bodyMode = asString(http.body)
    const { pathTemplate, queryDefaults } = splitUrlTemplate(urlTemplate, collection.apiBaseUrlTemplate)

    const params = Array.isArray(parsed.params) ? parsed.params.filter(isRecord) : []
    const extractedParams: Array<{
      name: string
      location: "path" | "query"
      required: boolean
      sampleValue: unknown
      enabled: boolean
    }> = params.flatMap((param) => {
      const name = asString(param.name)
      const location = asString(param.type)
      if (!name || (location !== "path" && location !== "query")) {
        return []
      }
      const typedLocation = location === "path" ? "path" : "query"
      return [
        {
          name,
          location: typedLocation,
          required: typedLocation === "path",
          sampleValue: param.value,
          enabled: param.enabled !== false,
        },
      ]
    })

    for (const queryParam of extractedParams) {
      if (queryParam.location !== "query" || queryParam.enabled === false) {
        continue
      }
      const sample = asString(queryParam.sampleValue)
      if (sample === undefined || sample === "") {
        continue
      }
      if (!(queryParam.name in queryDefaults)) {
        queryDefaults[queryParam.name] = sample
      }
    }

    const headers = Array.isArray(parsed.headers) ? parsed.headers.filter(isRecord) : []
    const staticHeaders: Record<string, string> = {}
    for (const header of headers) {
      if (header.enabled === false) {
        continue
      }
      const headerName = asString(header.name)
      const headerValue = asString(header.value)
      if (!headerName || !headerValue || headerValue.includes("{{")) {
        continue
      }
      staticHeaders[headerName] = headerValue
    }

    const input = buildInputSchema({
      params: extractedParams.map(({ enabled: _, ...param }) => param),
      body,
      ...(bodyMode ? { bodyMode } : {}),
    })

    const rawName = request.relativePath.replace(/\.bru$/i, "")
    const candidateName = sanitizeToolName(rawName)
    const count = usedNames.get(candidateName) ?? 0
    usedNames.set(candidateName, count + 1)
    const name = count === 0 ? candidateName : `${candidateName}_${count + 1}`

    const description = firstLine(docs) ?? `${method} ${pathTemplate}`
    const displayName = asString(meta.name) ?? rawName

    tools.push({
      id: request.relativePath,
      name,
      displayName,
      description,
      sourcePath: request.relativePath,
      inputSchema: input.schema,
      inputJsonSchema: input.jsonSchema,
      binding: {
        method,
        pathTemplate,
        params: extractedParams.map(({ name, location, required }) => ({
          name,
          location,
          required,
        })),
        queryDefaults,
        staticHeaders,
        bodyMode,
      },
    })
  }

  return tools
}
