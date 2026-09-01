import { Pool, neonConfig } from "@neondatabase/serverless"
import ws from "ws"

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required")
const pool = new Pool({ connectionString, max: 1, allowExitOnIdle: true })
const client = await pool.connect()
try {
  const migrations = await client.query("select version, applied_at from schema_migrations order by version")
  const snapshots = await client.query("select snapshots.source_id, snapshots.generation, snapshots.completed_at, count(items.native_record_key)::int as records from source_snapshots snapshots left join source_snapshot_items items using (source_id) group by snapshots.source_id, snapshots.generation, snapshots.completed_at order by snapshots.source_id")
  const runs = await client.query("select source_id, count(*)::int as runs, count(*) filter (where status='SUCCEEDED')::int as succeeded, coalesce(sum(transitions_emitted),0)::int as transitions from source_runs group by source_id order by source_id")
  const transitions = await client.query("select event_type, count(*)::int as count from event_transitions group by event_type order by event_type")
  const pilots = await client.query("select count(*)::int as total, count(*) filter (where follow_up_consent and consent_at is not null)::int as consented from pilot_requests")
  console.log(JSON.stringify({ migrations: migrations.rows, snapshots: snapshots.rows, runs: runs.rows, transitions: transitions.rows, pilotRequests: pilots.rows[0] }, null, 2))
} finally {
  client.release()
  await pool.end()
}
