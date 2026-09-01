import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/pilot-intake", () => ({
  pilotIntakeReady: vi.fn(),
  persistPilotSubmission: vi.fn(),
}))

import { GET, POST } from "@/app/api/pilot-signup/route"
import { persistPilotSubmission, pilotIntakeReady } from "@/lib/pilot-intake"

const ready = vi.mocked(pilotIntakeReady)
const persist = vi.mocked(persistPilotSubmission)

beforeEach(() => {
  ready.mockReset().mockResolvedValue(true)
  persist.mockReset().mockResolvedValue("accepted")
})

describe("pilot signup endpoint", () => {
  it("reports database-backed readiness without exposing a destination", async () => {
    expect(await GET().then((response) => response.json())).toEqual({ configured: true })
    ready.mockResolvedValue(false)
    expect(await GET().then((response) => response.json())).toEqual({ configured: false })
  })

  it("persists a consented submission and preserves the response contract", async () => {
    const response = await POST(new Request("http://localhost/api/pilot-signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.10", "user-agent": "test" },
      body: JSON.stringify({ email: "analyst@example.com", consent: true, website: "" }),
    }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true })
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ email: "analyst@example.com", rateIdentifier: "192.0.2.10|test" }))
  })

  it("rejects missing consent, malformed, cross-origin, and oversized input", async () => {
    const base = { method: "POST", headers: { "content-type": "application/json" } }
    expect((await POST(new Request("http://localhost/api/pilot-signup", { ...base, body: JSON.stringify({ email: "analyst@example.com" }) }))).status).toBe(400)
    expect((await POST(new Request("http://localhost/api/pilot-signup", { ...base, body: JSON.stringify({ email: "not-email", consent: true, admin: true }) }))).status).toBe(400)
    expect((await POST(new Request("http://localhost/api/pilot-signup", { ...base, headers: { ...base.headers, origin: "https://evil.example" }, body: JSON.stringify({ email: "analyst@example.com", consent: true }) }))).status).toBe(403)
    expect((await POST(new Request("http://localhost/api/pilot-signup", { ...base, headers: { ...base.headers, "content-length": "5000" }, body: "{}" }))).status).toBe(413)
  })

  it("fails closed when unavailable and exposes a generic rate limit", async () => {
    ready.mockResolvedValue(false)
    const body = JSON.stringify({ email: "analyst@example.com", consent: true })
    expect((await POST(new Request("http://localhost/api/pilot-signup", { method: "POST", body }))).status).toBe(503)
    ready.mockResolvedValue(true)
    persist.mockResolvedValue("rate_limited")
    const limited = await POST(new Request("http://localhost/api/pilot-signup", { method: "POST", body }))
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("900")
  })
})
