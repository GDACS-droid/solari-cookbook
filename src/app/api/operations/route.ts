import { databaseConfigured } from "@/lib/postgres"
import { readLatestOperations } from "@/lib/postgres-snapshot-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  if (!databaseConfigured()) return Response.json({ configured: false, sources: [] }, { status: 503, headers: { "Cache-Control": "no-store" } })
  try {
    return Response.json({ configured: true, sources: await readLatestOperations() }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } })
  } catch {
    return Response.json({ configured: false, sources: [] }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
