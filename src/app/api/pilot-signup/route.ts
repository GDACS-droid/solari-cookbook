import { z } from "zod"
import { persistPilotSubmission, pilotIntakeReady } from "@/lib/pilot-intake"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const pilotSignup = z.object({
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(120).optional(),
  workflow: z.string().trim().max(500).optional(),
  consent: z.literal(true),
  // Honeypot. A legitimate UI leaves this empty.
  website: z.string().max(0).optional().default(""),
}).strict()

function noStore(status = 200) {
  return { status, headers: { "Cache-Control": "no-store" } }
}

export async function GET(): Promise<Response> {
  return Response.json({ configured: await pilotIntakeReady() }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } })
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 4_096) return Response.json({ error: "Request is too large." }, noStore(413))
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origin not allowed." }, noStore(403))

  let body: unknown
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, "utf8") > 4_096) return Response.json({ error: "Request is too large." }, noStore(413))
    body = JSON.parse(raw)
  } catch { return Response.json({ error: "Invalid JSON body" }, noStore(400)) }
  const parsed = pilotSignup.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Enter a valid work email and confirm follow-up consent." }, noStore(400))
  if (!await pilotIntakeReady()) return Response.json({ error: "Pilot signup is not configured on this deployment." }, noStore(503))

  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown"
  const clientIdentifier = `${forwarded.split(",")[0]?.trim() || "unknown"}|${request.headers.get("user-agent") ?? "unknown"}`
  try {
    const result = await persistPilotSubmission({
      email: parsed.data.email,
      company: parsed.data.company || undefined,
      workflow: parsed.data.workflow || undefined,
      rateIdentifier: clientIdentifier,
    })
    if (result === "rate_limited") return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "900" } })
    return Response.json({ accepted: true }, noStore(202))
  } catch {
    return Response.json({ error: "Pilot signup could not be saved." }, noStore(502))
  }
}
