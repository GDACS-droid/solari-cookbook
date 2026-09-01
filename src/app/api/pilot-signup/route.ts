import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const pilotSignup = z.object({
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(120).optional(),
  workflow: z.string().trim().max(500).optional(),
  // Honeypot. A legitimate UI leaves this empty.
  website: z.string().max(0).optional().default(""),
}).strict()

function configuredEndpoint(): URL | undefined {
  const raw = process.env.PILOT_SIGNUP_WEBHOOK_URL
  if (!raw) return undefined
  const url = new URL(raw)
  if (url.protocol !== "https:") throw new Error("Pilot webhook must use HTTPS")
  return url
}

/** Readiness only. Never expose the configured destination to the browser. */
export function GET(): Response {
  try {
    return Response.json({ configured: Boolean(configuredEndpoint()) }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } })
  }
}

/**
 * Privacy-minimal pilot intake. The deployment owner supplies the server-only
 * webhook; the URL and its response are never exposed to the browser.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const parsed = pilotSignup.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Enter a valid work email and keep fields within their limits." }, { status: 400 })

  let endpoint: URL | undefined
  try { endpoint = configuredEndpoint() } catch { return Response.json({ error: "Pilot signup is not configured safely." }, { status: 503 }) }
  if (!endpoint) return Response.json({ error: "Pilot signup is not configured on this deployment." }, { status: 503 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: parsed.data.email,
        company: parsed.data.company || undefined,
        workflow: parsed.data.workflow || undefined,
        source: "acrebrief-pilot",
        submittedAt: new Date().toISOString(),
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) return Response.json({ error: "Pilot signup could not be saved." }, { status: 502 })
    return Response.json({ accepted: true }, { status: 202 })
  } catch {
    return Response.json({ error: "Pilot signup could not be saved." }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
