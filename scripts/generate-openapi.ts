#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { brunoCollectionToOpenApi } from "./lib/bruno-to-openapi.ts"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(scriptDir)
const outPath = join(projectRoot, "specs/main-api.openapi.json")

const spec = brunoCollectionToOpenApi()
const operationCount = Object.values(spec.paths).reduce(
  (count, pathItem) => count + Object.keys(pathItem as object).filter((k) => k !== "parameters").length,
  0,
)

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`)

console.error(`Wrote ${outPath} (${operationCount} operations, ${Object.keys(spec.paths).length} paths)`)
