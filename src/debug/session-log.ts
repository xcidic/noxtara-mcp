import { appendFileSync } from "node:fs"

import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as References from "effect/References"

const SESSION_ID = "814c70"
const LOG_PATH = "/home/erickc/projects/noxtara-mcp/.cursor/debug-814c70.log"
const INGEST_URL = "http://127.0.0.1:7435/ingest/f506e259-f8a4-4183-a09e-13b23295647f"

export const isSessionDebugEnabled = () => process.env.NOXTARA_DEBUG === "1"

export const sessionLog = (entry: {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
}) => {
  if (!isSessionDebugEnabled()) return

  const payload = {
    sessionId: SESSION_ID,
    hypothesisId: entry.hypothesisId,
    location: entry.location,
    message: entry.message,
    data: entry.data ?? {},
    timestamp: Date.now(),
    runId: process.env.DEBUG_RUN_ID ?? "pre-fix",
    pid: process.pid,
  }

  try {
    appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`)
  } catch {
    // ignore write failures in tests
  }

  fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

export const sessionLogEffect = (entry: {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
}) => Effect.sync(() => sessionLog(entry))

/** Install with `Effect.provide(Logger.layer([effectDebugLogger]))` when `NOXTARA_DEBUG=1`. */
export const effectDebugLogger = Logger.make<unknown, void>((options) => {
  const spans = options.fiber.getRef(References.CurrentLogSpans).map(([label, startTime]) => ({
    label,
    durationMs: Date.now() - startTime,
  }))

  sessionLog({
    hypothesisId: "EFFECT",
    location: "effect/Logger",
    message: "runtime log",
    data: {
      level: String(options.logLevel),
      message: options.message,
      annotations: { ...options.fiber.getRef(References.CurrentLogAnnotations) },
      spans,
    },
  })
})

export const withSessionLogSpan =
  (name: string, hypothesisId: string) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.withLogSpan(name),
      Effect.tap(() =>
        sessionLogEffect({
          hypothesisId,
          location: name,
          message: "log span finished",
        }),
      ),
    )
