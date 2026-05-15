import * as Schema from "effect/Schema"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

const inferScalarSchema = (sampleValue: unknown): Schema.Top => {
  if (typeof sampleValue === "boolean") {
    return Schema.Boolean
  }
  if (typeof sampleValue === "number" && Number.isFinite(sampleValue)) {
    return Schema.Number
  }
  if (typeof sampleValue === "string") {
    const trimmed = sampleValue.trim()
    const lower = trimmed.toLowerCase()
    if (lower === "true" || lower === "false") {
      return Schema.Boolean
    }
    const numeric = Number(trimmed)
    if (trimmed !== "" && Number.isFinite(numeric)) {
      return Schema.Number
    }
    return Schema.String
  }
  return Schema.String
}

const inferJsonSchema = (value: unknown): Schema.Top => {
  if (value === null) {
    return Schema.Null
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return Schema.Array(Schema.Unknown)
    }
    return Schema.Array(inferJsonSchema(value[0]))
  }

  if (isRecord(value)) {
    const fields: Record<string, Schema.Top> = {}
    for (const [key, nested] of Object.entries(value)) {
      fields[key] = inferJsonSchema(nested)
    }
    return Schema.Struct(fields as Schema.Struct.Fields)
  }

  return inferScalarSchema(value)
}

const buildMultipartBodySchema = (
  parts: Array<Record<string, unknown>>,
  bodyRequired: boolean,
): Schema.Top => {
  const fields: Record<string, Schema.Top> = {}
  for (const part of parts) {
    const name = asString(part.name)
    if (!name) {
      continue
    }
    const partType = asString(part.type)
    const sampleValue = Array.isArray(part.value) ? part.value[0] : part.value
    const schema = partType === "file" ? Schema.String : inferScalarSchema(sampleValue)
    fields[name] = part.enabled === false ? Schema.optionalKey(schema) : schema
  }

  const bodySchema = Schema.Struct(fields as Schema.Struct.Fields)
  return bodyRequired ? bodySchema : Schema.optionalKey(bodySchema)
}

const buildBodyFieldSchema = (
  bodyMode: string | undefined,
  body: Record<string, unknown>,
): Schema.Top | undefined => {
  if (bodyMode === "json") {
    let parsed: unknown
    const text = asString(body.json)
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
    }
    const inferred = parsed === undefined ? Schema.Unknown : inferJsonSchema(parsed)
    return Schema.optionalKey(inferred)
  }

  if (bodyMode === "multipartForm") {
    const multipart = Array.isArray(body.multipartForm) ? body.multipartForm.filter(isRecord) : []
    if (multipart.length === 0) {
      return Schema.optionalKey(Schema.Unknown)
    }
    return buildMultipartBodySchema(multipart, false)
  }

  if (bodyMode === "text") {
    return Schema.optionalKey(Schema.String)
  }

  return undefined
}

export const buildInputSchema = (endpoint: {
  params: Array<{
    name: string
    location: "path" | "query"
    required: boolean
    sampleValue?: unknown
  }>
  bodyMode?: string
  body: Record<string, unknown>
}) => {
  const fields: Record<string, Schema.Top> = {}

  for (const param of endpoint.params) {
    const field = inferScalarSchema(param.sampleValue)
    fields[param.name] = param.required ? field : Schema.optionalKey(field)
  }

  const bodyField = buildBodyFieldSchema(endpoint.bodyMode, endpoint.body)
  if (bodyField) {
    fields.body = bodyField
  }

  const schema = Schema.Struct(fields as Schema.Struct.Fields)
  const document = Schema.toJsonSchemaDocument(schema)
  const jsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  }

  return {
    schema,
    jsonSchema,
  }
}
