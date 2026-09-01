import { investigationInput, replayVerifiedSample } from "@/lib/investigation"
import { runOfficialLiveInvestigation } from "@/lib/official-live"
import { timingSafeEqual } from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function sse(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

let activeLiveRuns = 0
let lastPublicLiveRunAt = 0

function publicLiveDemoEnabled(): boolean {
  return process.env.ACREBRIEF_PUBLIC_LIVE_DEMO === "true"
}

function authorizedLiveRequest(request: Request): boolean {
  if (publicLiveDemoEnabled()) return true
  const expected = process.env.ACREBRIEF_LIVE_ACCESS_TOKEN
  const provided = request.headers.get("x-acrebrief-live-token")
  if (!expected || !provided) return false
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
}

/** POST /api/investigations: SSE stream; client input cannot select arbitrary URLs. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown = {}
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const parsed = investigationInput.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid investigation request", issues: parsed.error.issues }, { status: 400 })
  if (parsed.data.mode === "live" && !process.env.SOLARI_API_KEY) {
    return Response.json({ error: "SOLARI_API_KEY is required for a live investigation", fallback: "POST with mode=verified_sample for a clearly labeled replay" }, { status: 412 })
  }
  if (parsed.data.mode === "live" && !authorizedLiveRequest(request)) {
    return Response.json({ error: "A valid demo access token is required for paid live investigations." }, { status: 403 })
  }
  if (parsed.data.mode === "live" && publicLiveDemoEnabled() && Date.now() - lastPublicLiveRunAt < 60_000) {
    return Response.json({ error: "The public live demo is cooling down after a recent paid Solari run. Try again in one minute." }, { status: 429, headers: { "Retry-After": "60" } })
  }
  if (parsed.data.mode === "live" && activeLiveRuns >= 1) {
    return Response.json({ error: "A live investigation is already running. Retry after it completes." }, { status: 429, headers: { "Retry-After": "15" } })
  }
  if (parsed.data.mode === "live") {
    activeLiveRuns += 1
    if (publicLiveDemoEnabled()) lastPublicLiveRunAt = Date.now()
  }
  const runAbort = new AbortController()
  const abortFromRequest = () => runAbort.abort(request.signal.reason)
  if (request.signal.aborted) abortFromRequest()
  else request.signal.addEventListener("abort", abortFromRequest, { once: true })
  const events = parsed.data.mode === "live" ? runOfficialLiveInvestigation(parsed.data, runAbort.signal) : replayVerifiedSample()
  const iterator = events[Symbol.asyncIterator]()
  let released = false
  const release = () => {
    if (released) return
    released = true
    request.signal.removeEventListener("abort", abortFromRequest)
    if (parsed.data.mode === "live") activeLiveRuns = Math.max(0, activeLiveRuns - 1)
  }
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) {
          release()
          controller.close()
        } else controller.enqueue(sse(result.value))
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    async cancel() {
      runAbort.abort(new Error("Investigation stream cancelled"))
      try { await iterator.return?.(undefined) }
      finally { release() }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } })
}
