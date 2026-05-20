import { HttpClientRequest } from "effect/unstable/http"
import { describe, expect, it } from "vitest"

import { formatUpstreamHeaders, formatUpstreamUrl } from "./upstream-log.ts"

describe("upstream-log", () => {
  it("builds full URL from base and path", () => {
    const request = HttpClientRequest.get("/asm/{teamId}").pipe(
      HttpClientRequest.setUrlParam("teamId", "abc"),
    )
    expect(formatUpstreamUrl("https://dev.appsec.xcidic.com/api/main", request)).toBe(
      "https://dev.appsec.xcidic.com/api/main/asm/{teamId}?teamId=abc",
    )
  })

  it("redacts sensitive headers", () => {
    const request = HttpClientRequest.get("/test").pipe(
      HttpClientRequest.setHeader("x-pat", "secret-pat"),
      HttpClientRequest.setHeader("accept", "application/json"),
    )
    expect(formatUpstreamHeaders(request)).toEqual({
      "x-pat": "[redacted]",
      accept: "application/json",
    })
  })
})
