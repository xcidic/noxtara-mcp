import * as Schema from "effect/Schema"

export const OperationId = Schema.String.pipe(Schema.brand("OperationId"))
export type OperationId = typeof OperationId.Type

export const HttpMethod = Schema.Literals([
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
  "trace",
])
export type HttpMethod = typeof HttpMethod.Type

export const ParameterLocation = Schema.Literals(["path", "query", "header", "cookie"])
export type ParameterLocation = typeof ParameterLocation.Type

export const OperationParameter = Schema.Struct({
  name: Schema.String,
  location: ParameterLocation,
  required: Schema.Boolean,
  schema: Schema.OptionFromOptional(Schema.Unknown),
  style: Schema.OptionFromOptional(Schema.String),
  explode: Schema.OptionFromOptional(Schema.Boolean),
  allowReserved: Schema.OptionFromOptional(Schema.Boolean),
  description: Schema.OptionFromOptional(Schema.String),
})
export type OperationParameter = typeof OperationParameter.Type

export const EncodingObject = Schema.Struct({
  contentType: Schema.OptionFromOptional(Schema.String),
  style: Schema.OptionFromOptional(Schema.String),
  explode: Schema.OptionFromOptional(Schema.Boolean),
  allowReserved: Schema.OptionFromOptional(Schema.Boolean),
})
export type EncodingObject = typeof EncodingObject.Type

export const MediaBinding = Schema.Struct({
  contentType: Schema.String,
  schema: Schema.OptionFromOptional(Schema.Unknown),
  encoding: Schema.OptionFromOptional(Schema.Record(Schema.String, EncodingObject)),
})
export type MediaBinding = typeof MediaBinding.Type

export const OperationRequestBody = Schema.Struct({
  required: Schema.Boolean,
  contentType: Schema.String,
  schema: Schema.OptionFromOptional(Schema.Unknown),
  contents: Schema.OptionFromOptional(Schema.Array(MediaBinding)),
})
export type OperationRequestBody = typeof OperationRequestBody.Type

export const ExtractedOperation = Schema.Struct({
  operationId: OperationId,
  method: HttpMethod,
  pathTemplate: Schema.String,
  summary: Schema.OptionFromOptional(Schema.String),
  description: Schema.OptionFromOptional(Schema.String),
  tags: Schema.Array(Schema.String),
  parameters: Schema.Array(OperationParameter),
  requestBody: Schema.OptionFromOptional(OperationRequestBody),
  inputSchema: Schema.OptionFromOptional(Schema.Unknown),
  outputSchema: Schema.OptionFromOptional(Schema.Unknown),
  deprecated: Schema.Boolean,
})
export type ExtractedOperation = typeof ExtractedOperation.Type

export const ServerVariable = Schema.Struct({
  default: Schema.String,
  enum: Schema.OptionFromOptional(Schema.Array(Schema.String)),
  description: Schema.OptionFromOptional(Schema.String),
})
export type ServerVariable = typeof ServerVariable.Type

export const ServerInfo = Schema.Struct({
  url: Schema.String,
  description: Schema.OptionFromOptional(Schema.String),
  variables: Schema.OptionFromOptional(Schema.Record(Schema.String, ServerVariable)),
})
export type ServerInfo = typeof ServerInfo.Type

export const ExtractionResult = Schema.Struct({
  title: Schema.OptionFromOptional(Schema.String),
  version: Schema.OptionFromOptional(Schema.String),
  servers: Schema.Array(ServerInfo),
  operations: Schema.Array(ExtractedOperation),
})
export type ExtractionResult = typeof ExtractionResult.Type

export const OperationBinding = Schema.Struct({
  method: HttpMethod,
  pathTemplate: Schema.String,
  parameters: Schema.Array(OperationParameter),
  requestBody: Schema.OptionFromOptional(OperationRequestBody),
})
export type OperationBinding = typeof OperationBinding.Type

export const InvocationResult = Schema.Struct({
  status: Schema.Number,
  headers: Schema.Record(Schema.String, Schema.String),
  data: Schema.NullOr(Schema.Unknown),
  error: Schema.NullOr(Schema.Unknown),
})
export type InvocationResult = typeof InvocationResult.Type
