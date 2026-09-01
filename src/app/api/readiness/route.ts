import { databaseConfigured, withDatabaseClient } from "@/lib/postgres"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const revision = process.env.ACREBRIEF_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local"
  if (!databaseConfigured()) return Response.json({ revision, database: "unconfigured" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  try {
    const result = await withDatabaseClient((client) => client.query(
      `select
         (select count(*)::int from schema_migrations) as migrations,
         (select count(*)::int from source_snapshots) as snapshots,
         (select count(*)::int from source_runs) as source_runs`,
    ))
    return Response.json({ revision, database: "ready", ...result.rows[0] }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ revision, database: "unready" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
