#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { bruToJsonV2 } from "@usebruno/lang"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(scriptDir)
const collectionDir = join(projectRoot, "submodules/product-appsec-apidocs/main-api-collection")

if (!existsSync(collectionDir)) {
  console.error(`Collection not found at ${collectionDir}`)
  console.error("Run `node scripts/references.ts` first to clone the API docs.")
  process.exit(1)
}

const isBruFile = (name: string) =>
  name.endsWith(".bru") && name !== "collection.bru" && name !== "folder.bru"

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

    const meta = isRecord(parsed.meta) ? parsed.meta : {}
    const http = isRecord(parsed.http) ? parsed.http : {}
    const body = isRecord(parsed.body) ? parsed.body : {}
    const docs = asString(parsed.docs)
    const examples = Array.isArray(parsed.examples) ? parsed.examples : []
    const params = Array.isArray(parsed.params) ? parsed.params.filter(isRecord) : []

    const pathParams = params.filter((p) => p.type === "path")
    const queryParams = params.filter((p) => p.type === "query")
    const formatParam = (param: Record<string, unknown>) =>
      `${asString(param.name) ?? "?"}${param.enabled === false ? " (disabled)" : ""}`
    const metaName = asString(meta.name) ?? relPath
    const method = asString(http.method)?.toUpperCase() ?? "?"
    const url = asString(http.url) ?? "?"

    console.log(`── ${metaName} ──`)
    console.log(`  File:   ${relPath}`)
    console.log(`  Method: ${method}`)

    const placeholders = url.match(/:(\w+)/g)
    if (placeholders) {
      console.log(`  URL:    ${url}`)
      console.log(`  Path:   [${placeholders.join(", ")}]`)
    } else {
      console.log(`  URL:    ${url}`)
    }

    if (pathParams.length) {
      console.log(`  Path params:  ${pathParams.map(formatParam).join(", ")}`)
    }
    if (queryParams.length) {
      console.log(`  Query params: ${queryParams.map(formatParam).join(", ")}`)
    }
    if (asString(body.json)) {
      console.log(`  Body:   JSON present`)
    }
    if (docs) {
      const firstLine = docs.trim().split("\n")[0] ?? ""
      console.log(`  Docs:   ${firstLine.slice(0, 120)}`)
    }
    if (examples.length) {
      const ex = examples[0]
      const response = isRecord(ex) && isRecord(ex.response) ? ex.response : undefined
      const responseBody = response && isRecord(response.body) ? response.body : undefined
      const responseContent = asString(responseBody?.content)
      const status = response && isRecord(response.status) ? response.status : undefined

      if (responseContent) {
        const statusCode = asString(status?.code) ?? status?.code ?? "?"
        const statusText = asString(status?.text) ?? ""
        console.log(`  Resp:   ${statusCode} ${statusText} (${responseContent.length} bytes JSON)`)
      }
    }
    console.log("")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`✗ Failed to parse ${relPath}: ${message}`)
  }
}
