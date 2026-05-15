import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { bruToJsonV2, collectionBruToJson } from "@usebruno/lang"

const COLLECTION_FILE = "collection.bru"
const DEFAULT_COLLECTION_SUBPATH = "submodules/product-appsec-apidocs/main-api-collection"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

const collectRequestBruFiles = (dir: string): string[] => {
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "environments") {
        continue
      }
      files.push(...collectRequestBruFiles(fullPath))
      continue
    }
    if (
      entry.isFile() &&
      entry.name.endsWith(".bru") &&
      entry.name !== COLLECTION_FILE &&
      entry.name !== "folder.bru"
    ) {
      files.push(fullPath)
    }
  }

  return files
}

const extractApiBaseUrlTemplate = (collection: ReturnType<typeof collectionBruToJson>) => {
  const vars = isRecord(collection.vars) ? collection.vars : {}
  const reqVars = Array.isArray(vars.req) ? vars.req.filter(isRecord) : []
  const apiBaseUrl = reqVars.find(
    (entry) => asString(entry.name) === "API_BASE_URL" && entry.enabled !== false,
  )

  return asString(apiBaseUrl?.value)
}

export const parseBrunoCollection = () => {
  const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
  const collectionDir = join(projectRoot, DEFAULT_COLLECTION_SUBPATH)

  if (!existsSync(collectionDir)) {
    throw new Error(`Bruno collection not found at ${collectionDir}`)
  }

  const collectionPath = join(collectionDir, COLLECTION_FILE)
  if (!existsSync(collectionPath)) {
    throw new Error(`Missing collection file at ${collectionPath}`)
  }

  const collection = collectionBruToJson(readFileSync(collectionPath, "utf8"))
  const apiBaseUrlTemplate = extractApiBaseUrlTemplate(collection)
  const requestFiles = collectRequestBruFiles(collectionDir)
  const requests = requestFiles.map((filePath) => {
    const relativePath = relative(collectionDir, filePath)
    const parsed = bruToJsonV2(readFileSync(filePath, "utf8"))
    return {
      filePath,
      relativePath,
      parsed,
    }
  })

  return {
    collectionDir,
    collectionPath,
    apiBaseUrlTemplate,
    requestCount: requests.length,
    requests,
  }
}
