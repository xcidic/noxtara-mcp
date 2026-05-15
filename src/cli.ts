#!/usr/bin/env node

import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { NodeRuntime, NodeServices } from "@effect/platform-node"

import { serveNoxtaraMcp } from "./mcp/server.ts"
import { createBrunoRegistry } from "./runtime/bruno-registry.ts"

const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error))

class CliCommandError extends Data.TaggedError("CliCommandError")<{
  message: string
}> {}

const parseJsonInput = (value: string) =>
  Effect.try({
    try: () => Schema.decodeSync(Schema.UnknownFromJsonString)(value),
    catch: (error) => new CliCommandError({ message: `Invalid JSON input: ${formatError(error)}` }),
  })

const search = Flag.string("search").pipe(
  Flag.optional,
  Flag.withDescription("Filter by tool name"),
)

const toolsListCommand = Command.make("list", { search }, ({ search }) =>
  Effect.gen(function* () {
    const registry = createBrunoRegistry()
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
).pipe(Command.withDescription("List discovered Bruno tools"))

const toolName = Argument.string("tool")
const input = Flag.string("input").pipe(
  Flag.withAlias("i"),
  Flag.withDescription("Tool input arguments as JSON object"),
  Flag.withDefault("{}"),
)

const toolsInvokeCommand = Command.make("invoke", { toolName, input }, ({ toolName, input }) =>
  Effect.gen(function* () {
    const registry = createBrunoRegistry()
    const parsedInput = yield* parseJsonInput(input)
    const result = yield* Effect.tryPromise({
      try: () => registry.invokeTool(toolName, parsedInput),
      catch: (error) => new CliCommandError({ message: formatError(error) }),
    })
    yield* Console.log(result.content[0]?.text ?? "")
  }).pipe(Effect.catch((error) => Console.error(formatError(error)))),
).pipe(Command.withDescription("Invoke one tool by name"))

const toolsCommand = Command.make("tools", {}).pipe(
  Command.withDescription("Bruno-derived tool commands"),
  Command.withSubcommands([toolsListCommand, toolsInvokeCommand]),
)

const serveMcpCommand = Command.make("serve-mcp", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Starting MCP server on stdio...")
    yield* Effect.tryPromise({
      try: () => serveNoxtaraMcp(),
      catch: (error) => new CliCommandError({ message: formatError(error) }),
    })
  }).pipe(Effect.catch((error) => Console.error(formatError(error)))),
).pipe(Command.withDescription("Run MCP server over stdio"))

const command = Command.make("pkg-placeholder", {}).pipe(
  Command.withDescription("Noxtara MCP CLI"),
  Command.withSubcommands([toolsCommand, serveMcpCommand]),
)

const cli = Command.run(command, {
  version: "0.0.1",
})

const MainLayer = Layer.empty.pipe(Layer.provideMerge(NodeServices.layer))

NodeRuntime.runMain(cli.pipe(Effect.provide(MainLayer)) as Effect.Effect<void, unknown, never>)
