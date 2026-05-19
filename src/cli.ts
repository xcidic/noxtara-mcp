#!/usr/bin/env node

import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { NodeRuntime, NodeServices } from "@effect/platform-node"

import { serveNoxtaraMcp, serveNoxtaraMcpHttp } from "./mcp/server.ts"
import { createOpenApiRegistry } from "./runtime/openapi/registry.ts"

class CliCommandError extends Data.TaggedError("CliCommandError")<{
  message: string
}> {}

const search = Flag.string("search").pipe(
  Flag.optional,
  Flag.withDescription("Filter by tool name"),
)

const toolsListCommand = Command.make("list", { search }, ({ search }) =>
  Effect.gen(function* () {
    const registry = createOpenApiRegistry()
    const filter = Option.getOrUndefined(search)?.toLowerCase()
    const tools = registry
      .listTools()
      .filter((tool) => (filter ? tool.name.toLowerCase().includes(filter) : true))

    if (tools.length === 0) {
      yield* Console.log("No tools found.")
      return
    }

    for (const tool of tools) {
      yield* Console.log(`${tool.name} - ${tool.description}`)
    }
  }),
).pipe(Command.withDescription("List discovered OpenAPI tools"))

const toolName = Argument.string("tool")
const input = Flag.string("input").pipe(
  Flag.withAlias("i"),
  Flag.withDescription("Tool input arguments as JSON object"),
  Flag.withDefault("{}"),
)

const toolsInvokeCommand = Command.make("invoke", { toolName, input }, ({ toolName, input }) =>
  Effect.gen(function* () {
    const registry = createOpenApiRegistry()
    const parsedInput = yield* Effect.try({
      try: () => Schema.decodeSync(Schema.UnknownFromJsonString)(input),
      catch: (error) =>
        new CliCommandError({
          message: `Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
    const result = yield* Effect.tryPromise({
      try: () => registry.invokeTool(toolName, parsedInput),
      catch: (error) =>
        new CliCommandError({ message: error instanceof Error ? error.message : String(error) }),
    })
    yield* Console.log(result.content[0]?.text ?? "")
  }).pipe(
    Effect.catch((error) => Console.error(error instanceof Error ? error.message : String(error))),
  ),
).pipe(Command.withDescription("Invoke one tool by name"))

const toolsCommand = Command.make("tools", {}).pipe(
  Command.withDescription("OpenAPI-derived tool commands"),
  Command.withSubcommands([toolsListCommand, toolsInvokeCommand]),
)

const port = Flag.integer("port").pipe(
  Flag.withAlias("p"),
  Flag.withDescription("HTTP server port"),
  Flag.withDefault(3434),
)

const mcpCommand = Command.make("mcp", {}, () =>
  Effect.gen(function* () {
    yield* Console.error("Starting MCP server on stdio...")
    yield* Effect.tryPromise({
      try: () => serveNoxtaraMcp(),
      catch: (error) =>
        new CliCommandError({ message: error instanceof Error ? error.message : String(error) }),
    })
  }).pipe(
    Effect.catch((error) => Console.error(error instanceof Error ? error.message : String(error))),
  ),
).pipe(Command.withDescription("Run MCP server over stdio"))

const mcpHttpCommand = Command.make("mcp-http", { port }, ({ port }) =>
  Effect.gen(function* () {
    yield* Console.error(`Starting MCP HTTP server on port ${port}...`)
    yield* Effect.tryPromise({
      try: () => serveNoxtaraMcpHttp({ port }),
      catch: (error) =>
        new CliCommandError({ message: error instanceof Error ? error.message : String(error) }),
    })
  }).pipe(
    Effect.catch((error) => Console.error(error instanceof Error ? error.message : String(error))),
  ),
).pipe(Command.withDescription("Run MCP server over HTTP"))

const command = Command.make("pkg-placeholder", {}).pipe(
  Command.withDescription("Noxtara MCP CLI"),
  Command.withSubcommands([toolsCommand, mcpCommand, mcpHttpCommand]),
)

const cli = Command.run(command, {
  version: "0.0.1",
})

const MainLayer = Layer.empty.pipe(Layer.provideMerge(NodeServices.layer))

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLayer)) as Effect.Effect<void, unknown, never>)
