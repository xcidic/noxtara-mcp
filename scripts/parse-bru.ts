#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

import { bruToJsonV2, collectionBruToJson } from "@usebruno/lang"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(scriptDir)
const collectionDir = join(
  projectRoot,
  "submodules/product-appsec-apidocs/main-api-collection",
)

if (!existsSync(collectionDir)) {
  console.error(`Collection not found at ${collectionDir}`)
  console.error("Run `node scripts/references.ts` first to clone the API docs.")
  process.exit(1)
}

const isBruFile = (name: string) => name.endsWith(".bru") && name !== "collection.bru" && name !== "folder.bru"

function collectBruFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectBruFiles(full))
    } else if (entry.isFile() && isBruFile(entry.name)) {
      files.push(full)
    }
  }
  return files
}

const bruFiles = collectBruFiles(collectionDir)

console.log(`Found ${bruFiles.length} request .bru files\n`)

for (const file of bruFiles) {
  const content = readFileSync(file, "utf-8")
  const relPath = relative(collectionDir, file)

  try {
    const parsed = bruToJsonV2(content)

    const meta = parsed.meta ?? {}
    const http = parsed.http ?? {}
    const params = parsed.params ?? []
    const body = parsed.body
    const docs = parsed.docs
    const examples = parsed.examples

    const pathParams = params.filter((p: any) => p.type === "path")
    const queryParams = params.filter((p: any) => p.type === "query")

    console.log(`── ${meta.name ?? relPath} ──`)
    console.log(`  File:   ${relPath}`)
    console.log(`  Method: ${http.method?.toUpperCase() ?? "?"}`)

    const url = http.url ?? "?"
    const placeholders = url.match(/:(\w+)/g)
    if (placeholders) {
      console.log(`  URL:    ${url}`)
      console.log(`  Path:   [${placeholders.join(", ")}]`)
    } else {
      console.log(`  URL:    ${url}`)
    }

    if (pathParams.length) {
      console.log(`  Path params:  ${pathParams.map((p: any) => `${p.name}${p.enabled === false ? " (disabled)" : ""}`).join(", ")}`)
    }
    if (queryParams.length) {
      console.log(`  Query params: ${queryParams.map((p: any) => `${p.name}${p.enabled === false ? " (disabled)" : ""}`).join(", ")}`)
    }
    if (body?.json) {
      console.log(`  Body:   JSON present`)
    }
    if (docs) {
      const firstLine = docs.trim().split("\n")[0]
      console.log(`  Docs:   ${firstLine.slice(0, 120)}`)
    }
    if (examples?.length) {
      const ex = examples[0]
      if (ex.response?.body?.content) {
        const status = ex.response.status
        console.log(`  Resp:   ${status?.code ?? "?"} ${status?.text ?? ""} (${ex.response.body.content.length} bytes JSON)`)
      }
    }
    console.log("")
  } catch (err: any) {
    console.error(`✗ Failed to parse ${relPath}: ${err.message}`)
  }
}
