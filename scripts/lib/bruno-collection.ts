import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { bruToJsonV2 } from "@usebruno/lang"

const COLLECTION_FILE = "collection.bru"
export const DEFAULT_COLLECTION_SUBPATH = "submodules/product-appsec-apidocs/main-api-collection"

const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

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

export const shouldIncludeRequestPath = (relativePath: string) => {
  const lower = relativePath.toLowerCase()
  if (lower.includes("[deprecated]")) return false
  if (lower.includes("[internal]")) return false
  if (lower.includes("[private]")) return false
  if (lower.includes("[test]")) return false
  return true
}

export const parseBrunoCollection = (collectionSubpath = DEFAULT_COLLECTION_SUBPATH) => {
  const collectionDir = join(projectRoot, collectionSubpath)

  if (!existsSync(collectionDir)) {
    throw new Error(`Bruno collection not found at ${collectionDir}`)
  }

  const collectionPath = join(collectionDir, COLLECTION_FILE)
  if (!existsSync(collectionPath)) {
    throw new Error(`Missing collection file at ${collectionPath}`)
  }

  const requestFiles = collectRequestBruFiles(collectionDir).filter((filePath) =>
    shouldIncludeRequestPath(relative(collectionDir, filePath)),
  )

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
    projectRoot,
    collectionDir,
    collectionPath,
    requestCount: requests.length,
    requests,
  }
}

export const splitUrlTemplate = (urlTemplate: string) => {
  const [withoutQuery, queryString] = urlTemplate.split("?")
  let pathTemplate = withoutQuery ?? ""

  pathTemplate = pathTemplate.replace(/^{{[^}]+}}/, "")
  if (!pathTemplate.startsWith("/")) {
    pathTemplate = `/${pathTemplate}`
  }

  pathTemplate = pathTemplate.replaceAll(/:([A-Za-z0-9_]+)/g, "{$1}")

  const queryDefaults: Record<string, string> = {}
  const rawQuery = queryString ?? ""
  if (rawQuery) {
    for (const [key, value] of new URLSearchParams(rawQuery)) {
      queryDefaults[key] = value
    }
  }

  return { pathTemplate, queryDefaults }
}

export const parseDocs = (value: unknown) => {
  if (typeof value === "string") {
    return value
  }
  if (isRecord(value) && typeof value.split === "function") {
    const lines = value.split("\n")
    if (Array.isArray(lines) && lines.every((line) => typeof line === "string")) {
      return lines.join("\n")
    }
  }
  return undefined
}

import { limitToolName } from "../../src/runtime/openapi/tool-name.ts"

export { limitToolName }

export const sanitizeOperationId = (relativePath: string, method: string) => {
  const fromPath = relativePath
    .replace(/\.bru$/i, "")
    .replace(/\\/g, "/")
    .split("/")
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  const normalized = fromPath || `${method.toLowerCase()}_request`
  const baseName = /^[a-z]/.test(normalized) ? normalized : `op_${normalized}`
  return limitToolName(baseName)
}

export { isRecord, asString }
