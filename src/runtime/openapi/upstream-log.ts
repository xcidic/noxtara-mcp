import * as Option from "effect/Option"
import { HttpClientRequest } from "effect/unstable/http"
import { toString as urlParamsToString } from "effect/unstable/http/UrlParams"

const SENSITIVE_HEADERS = new Set(["x-pat", "authorization", "cookie", "proxy-authorization"])

const redactHeaderValue = (name: string, value: string) => {
  const lower = name.toLowerCase()
  if (SENSITIVE_HEADERS.has(lower) || lower.includes("pat") || lower.includes("token")) {
    return "[redacted]"
  }
  return value
}

export const formatUpstreamUrl = (
  baseUrl: string,
  request: HttpClientRequest.HttpClientRequest,
) => {
  const fromRequest = HttpClientRequest.toUrl(request)
  if (Option.isSome(fromRequest)) {
    return fromRequest.value.toString()
  }

  const base = baseUrl.replace(/\/$/, "")
  const path = request.url.startsWith("/") ? request.url : `/${request.url}`
  const qs = urlParamsToString(request.urlParams)
  return qs.length > 0 ? `${base}${path}?${qs}` : `${base}${path}`
}

export const formatUpstreamHeaders = (request: HttpClientRequest.HttpClientRequest) => {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      out[name] = redactHeaderValue(name, value)
    }
  }
  return out
}

const appendTool = (parts: string[], tool: string | undefined) => {
  if (tool !== undefined) parts.push(`tool=${tool}`)
}

export const logUpstreamStart = (entry: {
  method: string
  url: string
  tool?: string | undefined
  headers?: Record<string, string>
  hasBody: boolean
}) => {
  const parts = [`[UPSTREAM] -> ${entry.method} ${entry.url}`]
  appendTool(parts, entry.tool)
  if (entry.hasBody) parts.push("body=yes")
  console.error(parts.join(" "))
  if (entry.headers && Object.keys(entry.headers).length > 0) {
    console.error("[UPSTREAM] headers:", JSON.stringify(entry.headers))
  }
}

export const logUpstreamFinish = (entry: {
  method: string
  url: string
  status: number
  ms: number
  tool?: string | undefined
  ok: boolean
}) => {
  const level = entry.ok ? "<-" : "!!"
  const parts = [
    `[UPSTREAM] ${level} ${entry.method} ${entry.url}`,
    `status=${entry.status}`,
    `ms=${entry.ms}`,
  ]
  appendTool(parts, entry.tool)
  console.error(parts.join(" "))
}

export const logUpstreamError = (entry: {
  method: string
  url: string
  ms: number
  tool?: string | undefined
  message: string
}) => {
  const parts = [
    `[UPSTREAM] !! ${entry.method} ${entry.url}`,
    `error=${entry.message}`,
    `ms=${entry.ms}`,
  ]
  appendTool(parts, entry.tool)
  console.error(parts.join(" "))
}
