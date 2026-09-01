import { cronAuthorized } from "@/lib/cron-auth"
import { databaseConfigured } from "@/lib/postgres"
import { PostgresSnapshotStore } from "@/lib/postgres-snapshot-store"
import { runCapeCoralEventStream } from "@/lib/snapshot-runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  if (!databaseConfigured()) {
    return Response.json({ error: "Durable state is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }

  // Leave time inside the 60-second function budget for terminal audit writes,
  // lease release, response serialization, and a truthful partial result.
  let run
  try {
    run = await runCapeCoralEventStream({ store: new PostgresSnapshotStore(), signal: AbortSignal.timeout(45_000) })
  } catch {
    return Response.json({ error: "Snapshot run failed before a safe source result was available" }, { status: 502, headers: { "Cache-Control": "no-store" } })
  }
  const payload = {
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    transitions: run.transitions.length,
    eventTypes: [...new Set(run.transitions.map((transition) => transition.eventType))].sort(),
    sources: run.sources.map((source) => ({
      sourceId: source.sourceId,
      status: source.status,
      bootstrap: source.bootstrap,
      windowStart: source.windowStart,
      windowEnd: source.windowEnd,
      recordsObserved: source.recordsObserved,
      recordsUnchanged: source.recordsUnchanged,
      transitions: source.transitions.length,
      durationMs: source.durationMs,
    })),
  }
  const status = run.status === "FAILED" ? 502 : run.status === "PARTIAL" ? 207 : 200
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } })
}
