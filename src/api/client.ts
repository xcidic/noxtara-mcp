import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "")

const normalizeContentType = (value: string | undefined) =>
  value?.split(";")[0]?.trim().toLowerCase() ?? ""

const stringifyParamValue = (value: unknown) => {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return JSON.stringify(value)
}

const isJsonContentType = (value: string | undefined) => {
  const normalized = normalizeContentType(value)
  return (
    normalized === "application/json" ||
    normalized.includes("+json") ||
    normalized.endsWith("/json")
  )
}

const makeRequest = (method: string, url: string) => {
  switch (method.toUpperCase()) {
    case "GET":
      return HttpClientRequest.get(url)
    case "POST":
      return HttpClientRequest.post(url)
    case "PUT":
      return HttpClientRequest.put(url)
    case "PATCH":
      return HttpClientRequest.patch(url)
    case "DELETE":
      return HttpClientRequest.delete(url)
    case "HEAD":
      return HttpClientRequest.head(url)
    case "OPTIONS":
      return HttpClientRequest.options(url)
    case "TRACE":
      return HttpClientRequest.trace(url)
    default:
      return HttpClientRequest.make(method.toUpperCase() as "GET")(url)
  }
}

const applyBody = (
  request: HttpClientRequest.HttpClientRequest,
  bodyMode: string | undefined,
  body: unknown,
) => {
  if (bodyMode === "multipartForm" && isRecord(body)) {
    return HttpClientRequest.bodyFormDataRecord(
      request,
      body as Parameters<typeof HttpClientRequest.bodyFormDataRecord>[1],
    )
  }

  if (bodyMode === "text") {
    return HttpClientRequest.bodyText(request, typeof body === "string" ? body : JSON.stringify(body))
  }

  if (typeof body === "string") {
    return HttpClientRequest.bodyText(request, body, "application/json")
  }

  return HttpClientRequest.bodyJsonUnsafe(request, body)
}

const resolvePathTemplate = (
  pathTemplate: string,
  params: Array<{ name: string; location: "path" | "query"; required: boolean }>,
  args: Record<string, unknown>,
) => {
  let path = pathTemplate

  for (const param of params) {
    if (param.location !== "path") {
      continue
    }
    const value = args[param.name]
    if (value === undefined || value === null) {
      if (param.required) {
        throw new Error(`Missing required path parameter: ${param.name}`)
      }
      continue
    }
    path = path.replaceAll(`{${param.name}}`, encodeURIComponent(stringifyParamValue(value)))
  }

  const unresolved = path.match(/\{([^{}]+)\}/g)
  if (unresolved && unresolved.length > 0) {
    throw new Error(`Unresolved path parameters: ${unresolved.join(", ")}`)
  }

  return path
}

export const invokeHttpBinding = (
  binding: {
    method: string
    pathTemplate: string
    params: Array<{ name: string; location: "path" | "query"; required: boolean }>
    queryDefaults: Record<string, string>
    staticHeaders: Record<string, string>
    bodyMode?: string
  },
  args: Record<string, unknown>,
  options: {
    baseUrl: string
    pat: string
  },
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const resolvedPath = resolvePathTemplate(binding.pathTemplate, binding.params, args)
    const baseUrl = normalizeBaseUrl(options.baseUrl)
    const url = `${baseUrl}${resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`}`

    let request = makeRequest(binding.method, url)

    for (const [name, value] of Object.entries(binding.queryDefaults)) {
      request = HttpClientRequest.setUrlParam(request, name, value)
    }

    for (const param of binding.params) {
      if (param.location !== "query") {
        continue
      }
      const value = args[param.name]
      if (value === undefined || value === null) {
        continue
      }
      request = HttpClientRequest.setUrlParam(request, param.name, stringifyParamValue(value))
    }

    for (const [headerName, headerValue] of Object.entries(binding.staticHeaders)) {
      request = HttpClientRequest.setHeader(request, headerName, headerValue)
    }

    request = HttpClientRequest.setHeader(request, "x-pat", options.pat)

    if ("body" in args && args.body !== undefined && binding.bodyMode !== "none") {
      request = applyBody(request, binding.bodyMode, args.body)
    }

    const response = yield* client.execute(request)
    const headers: Record<string, string> = { ...response.headers }
    const contentType = headers["content-type"]
    const status = response.status

    const payload =
      status === 204
        ? null
        : isJsonContentType(contentType)
          ? yield* response.json.pipe(Effect.catch(() => response.text))
          : yield* response.text

    return {
      status,
      headers,
      ok: status >= 200 && status < 300,
      data: status >= 200 && status < 300 ? payload : null,
      error: status >= 200 && status < 300 ? null : payload,
    }
  }).pipe(Effect.provide(NodeHttpClient.layerUndici))
