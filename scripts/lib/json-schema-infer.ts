const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

export const inferScalarSchema = (sampleValue: unknown): Record<string, unknown> => {
  if (typeof sampleValue === "boolean") {
    return { type: "boolean" }
  }
  if (typeof sampleValue === "number" && Number.isFinite(sampleValue)) {
    return { type: "number" }
  }
  if (typeof sampleValue === "string") {
    const trimmed = sampleValue.trim()
    const lower = trimmed.toLowerCase()
    if (lower === "true" || lower === "false") {
      return { type: "boolean" }
    }
    const numeric = Number(trimmed)
    if (trimmed !== "" && Number.isFinite(numeric)) {
      return { type: "number" }
    }
    return { type: "string" }
  }
  return { type: "string" }
}

export const inferJsonSchema = (value: unknown): Record<string, unknown> => {
  if (value === null) {
    return { type: "null" }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: {} }
    }
    return { type: "array", items: inferJsonSchema(value[0]) }
  }

  if (isRecord(value)) {
    const properties: Record<string, Record<string, unknown>> = {}
    for (const [key, nested] of Object.entries(value)) {
      properties[key] = inferJsonSchema(nested)
    }
    return { type: "object", properties, additionalProperties: false }
  }

  return inferScalarSchema(value)
}

export const inferParamSchema = (sampleValue: unknown) => inferScalarSchema(sampleValue)

export const buildRequestBody = (
  bodyMode: string | undefined,
  body: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!bodyMode || bodyMode === "none") {
    return undefined
  }

  if (bodyMode === "json") {
    const text = asString(body.json)
    let parsed: unknown
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
    }
    const schema = parsed === undefined ? {} : inferJsonSchema(parsed)
    return {
      required: false,
      content: {
        "application/json": { schema },
      },
    }
  }

  if (bodyMode === "multipartForm") {
    const multipart = Array.isArray(body.multipartForm) ? body.multipartForm.filter(isRecord) : []
    const properties: Record<string, Record<string, unknown>> = {}
    const required: string[] = []
    for (const part of multipart) {
      const name = asString(part.name)
      if (!name) continue
      const partType = asString(part.type)
      properties[name] =
        partType === "file" ? { type: "string", format: "binary" } : inferScalarSchema(part.value)
      if (part.enabled !== false) {
        required.push(name)
      }
    }
    if (Object.keys(properties).length === 0) {
      return undefined
    }
    return {
      required: required.length > 0,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
            additionalProperties: false,
          },
        },
      },
    }
  }

  if (bodyMode === "text") {
    return {
      required: false,
      content: {
        "text/plain": { schema: { type: "string" } },
      },
    }
  }

  return undefined
}
