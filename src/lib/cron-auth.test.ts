import { describe, expect, it } from "vitest"
import { cronAuthorized } from "@/lib/cron-auth"

describe("cron authorization", () => {
  it("accepts only an exact bearer secret", () => {
    expect(cronAuthorized("Bearer correct-secret", "correct-secret")).toBe(true)
    expect(cronAuthorized("Bearer wrong-secret", "correct-secret")).toBe(false)
    expect(cronAuthorized("Basic correct-secret", "correct-secret")).toBe(false)
    expect(cronAuthorized(null, "correct-secret")).toBe(false)
    expect(cronAuthorized("Bearer correct-secret", undefined)).toBe(false)
  })
})
