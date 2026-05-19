import { Data, type Option } from "effect"
import * as Schema from "effect/Schema"

export class OpenApiParseError extends Schema.TaggedErrorClass<OpenApiParseError>()(
  "OpenApiParseError",
  {
    message: Schema.String,
  },
) {}

export class OpenApiExtractionError extends Schema.TaggedErrorClass<OpenApiExtractionError>()(
  "OpenApiExtractionError",
  {
    message: Schema.String,
  },
) {}

export class OpenApiInvocationError extends Data.TaggedError("OpenApiInvocationError")<{
  readonly message: string
  readonly statusCode: Option.Option<number>
  readonly cause?: unknown
}> {}
