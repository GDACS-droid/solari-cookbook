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
    expect(body).toContain('"score":10')
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

  it("keeps public live mode opt-in at the server", async () => {
    const previousKey = process.env.SOLARI_API_KEY
    const previousPublic = process.env.ACREBRIEF_PUBLIC_LIVE_DEMO
    process.env.SOLARI_API_KEY = "configured-for-route-gate-test"
    delete process.env.ACREBRIEF_PUBLIC_LIVE_DEMO
    try {
      const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "live" }), headers: { "content-type": "application/json" } }))
      expect(response.status).toBe(403)
    } finally {
      if (previousKey) process.env.SOLARI_API_KEY = previousKey
      else delete process.env.SOLARI_API_KEY
      if (previousPublic) process.env.ACREBRIEF_PUBLIC_LIVE_DEMO = previousPublic
      else delete process.env.ACREBRIEF_PUBLIC_LIVE_DEMO
    }
  })

  it("propagates an already-aborted request into the live generator", async () => {
    const previousKey = process.env.SOLARI_API_KEY
    const previousPublic = process.env.ACREBRIEF_PUBLIC_LIVE_DEMO
    process.env.SOLARI_API_KEY = "configured-for-route-cancellation-test"
    process.env.ACREBRIEF_PUBLIC_LIVE_DEMO = "true"
    const controller = new AbortController()
    controller.abort(new Error("test client disconnect"))
    try {
      const response = await POST(new Request("http://localhost/api/investigations", { method: "POST", body: JSON.stringify({ mode: "live" }), headers: { "content-type": "application/json" }, signal: controller.signal }))
      expect(response.status).toBe(200)
      expect(await response.text()).toMatch(/"stage":"failed"/)
    } finally {
      if (previousKey) process.env.SOLARI_API_KEY = previousKey
      else delete process.env.SOLARI_API_KEY
      if (previousPublic) process.env.ACREBRIEF_PUBLIC_LIVE_DEMO = previousPublic
      else delete process.env.ACREBRIEF_PUBLIC_LIVE_DEMO
    }
  })
})
