import { describe, expect, it } from "vitest"
import { POST } from "@/app/api/investigations/route"

describe("investigation endpoint", () => {
  it("refuses to misrepresent a replay as a live run when no key exists", async () => {
    const previous = process.env.SOLARI_API_KEY
    delete process.env.SOLARI_API_KEY
    try {
      const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "live" }), headers: { "content-type": "application/json" } }))
      expect(response.status).toBe(412)
      expect((await response.json()).fallback).toMatch(/verified_sample/)
    } finally {
      if (previous) process.env.SOLARI_API_KEY = previous
    }
  })

  it("streams a visibly labeled verified replay", async () => {
    const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "verified_sample" }), headers: { "content-type": "application/json" } }))
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    const body = await response.text()
    expect(body).toContain('"clearlyLabeledReplay":true')
    expect(body).toContain('"stage":"complete"')
    expect(body).toContain('"score":46')
  })

  it("rejects unknown request fields instead of silently accepting URL input", async () => {
    const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "verified_sample", url: "http://169.254.169.254/latest/meta-data" }), headers: { "content-type": "application/json" } }))
    expect(response.status).toBe(400)
  })

  it("requires a server-configured access token before starting a paid run", async () => {
    const previousKey = process.env.SOLARI_API_KEY
    const previousToken = process.env.ACREBRIEF_LIVE_ACCESS_TOKEN
    process.env.SOLARI_API_KEY = "configured-for-route-gate-test"
    process.env.ACREBRIEF_LIVE_ACCESS_TOKEN = "server-only-demo-token"
    try {
      const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "live" }), headers: { "content-type": "application/json" } }))
      expect(response.status).toBe(403)
    } finally {
      if (previousKey) process.env.SOLARI_API_KEY = previousKey
      else delete process.env.SOLARI_API_KEY
      if (previousToken) process.env.ACREBRIEF_LIVE_ACCESS_TOKEN = previousToken
      else delete process.env.ACREBRIEF_LIVE_ACCESS_TOKEN
    }
  })

  it("does not let credentials or an environment ID override a review-required registry source", async () => {
    const previousKey = process.env.SOLARI_API_KEY
    const previousToken = process.env.ACREBRIEF_LIVE_ACCESS_TOKEN
    const previousSources = process.env.ACREBRIEF_APPROVED_SOURCE_IDS
    process.env.SOLARI_API_KEY = "configured-for-source-gate-test"
    process.env.ACREBRIEF_LIVE_ACCESS_TOKEN = "server-only-demo-token"
    process.env.ACREBRIEF_APPROVED_SOURCE_IDS = "lee_business_observer_legal_notices"
    try {
      const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "live" }), headers: { "content-type": "application/json", "x-acrebrief-live-token": "server-only-demo-token" } }))
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('"stage":"configuration_required"')
    } finally {
      if (previousKey) process.env.SOLARI_API_KEY = previousKey
      else delete process.env.SOLARI_API_KEY
      if (previousToken) process.env.ACREBRIEF_LIVE_ACCESS_TOKEN = previousToken
      else delete process.env.ACREBRIEF_LIVE_ACCESS_TOKEN
      if (previousSources) process.env.ACREBRIEF_APPROVED_SOURCE_IDS = previousSources
      else delete process.env.ACREBRIEF_APPROVED_SOURCE_IDS
    }
  })
})
