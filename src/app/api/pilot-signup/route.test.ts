import { afterEach, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/pilot-signup/route"

const previousEndpoint = process.env.PILOT_SIGNUP_WEBHOOK_URL

afterEach(() => {
  if (previousEndpoint) process.env.PILOT_SIGNUP_WEBHOOK_URL = previousEndpoint
  else delete process.env.PILOT_SIGNUP_WEBHOOK_URL
})

describe("pilot signup endpoint", () => {
  it("reports readiness without exposing an endpoint", async () => {
    delete process.env.PILOT_SIGNUP_WEBHOOK_URL
    expect(await GET().json()).toEqual({ configured: false })
    process.env.PILOT_SIGNUP_WEBHOOK_URL = "https://forms.example.test/intake"
    expect(await GET().json()).toEqual({ configured: true })
    expect(JSON.stringify(await GET().json())).not.toContain("forms.example.test")
  })
  it("does not pretend an unconfigured signup was stored", async () => {
    delete process.env.PILOT_SIGNUP_WEBHOOK_URL
    const response = await POST(new Request("http://localhost/api/pilot-signup", {
      method: "POST",
      body: JSON.stringify({ email: "analyst@example.com" }),
    }))
    expect(response.status).toBe(503)
  })

  it("rejects malformed or over-broad input", async () => {
    const response = await POST(new Request("http://localhost/api/pilot-signup", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", admin: true }),
    }))
    expect(response.status).toBe(400)
  })
})
