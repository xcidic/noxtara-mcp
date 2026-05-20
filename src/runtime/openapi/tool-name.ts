import { createHash } from "node:crypto"

/** Cursor MCP frontend enforces max 64 chars (stricter than MCP SEP's 128). */
export const MCP_TOOL_NAME_MAX_LENGTH = 64

const TRUNCATED_PREFIX_LENGTH = 55
const HASH_SUFFIX_LENGTH = 8

/** Truncate long names and append a stable hash suffix to stay within MCP limits. */
export const limitToolName = (name: string): string => {
  if (name.length <= MCP_TOOL_NAME_MAX_LENGTH) {
    return name
  }
  const hashStr = createHash("sha256").update(name).digest("hex").slice(0, HASH_SUFFIX_LENGTH)
  return `${name.slice(0, TRUNCATED_PREFIX_LENGTH)}_${hashStr}`
}
