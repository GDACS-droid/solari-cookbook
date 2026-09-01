import { afterEach, describe, expect, it } from "vitest"
import { POST } from "@/app/api/pilot-signup/route"

const previousEndpoint = process.env.PILOT_SIGNUP_WEBHOOK_URL

afterEach(() => {
  if (previousEndpoint) process.env.PILOT_SIGNUP_WEBHOOK_URL = previousEndpoint
  else delete process.env.PILOT_SIGNUP_WEBHOOK_URL
})

describe("pilot signup endpoint", () => {
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
