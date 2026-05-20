import { describe, expect, it } from "vitest"

import { limitToolName, MCP_TOOL_NAME_MAX_LENGTH } from "./tool-name.ts"

describe("limitToolName", () => {
  it("returns short names unchanged", () => {
    expect(limitToolName("account_get_my_account")).toBe("account_get_my_account")
  })

  it("truncates long names to at most 64 characters", () => {
    const long =
      "api_manager_sample_protected_api_endpoints_sample_api_require_key_with_specific_permission_vpn"
    const limited = limitToolName(long)
    expect(limited.length).toBe(MCP_TOOL_NAME_MAX_LENGTH)
    expect(limited).toMatch(/^[a-z0-9_]+$/)
    expect(limited).toMatch(/^api_manager_sample_protected_api_endpoints_sample_api_r_[0-9a-f]{8}$/)
  })
})
