import type { PoolClient } from "@neondatabase/serverless"
import { withDatabaseClient } from "@/lib/postgres"
import type {
  OperationalSnapshotStore,
  SnapshotState,
  SnapshotTransition,
  SourceRunAudit,
  SourceSnapshot,
  StoredSnapshotRecord,
} from "@/lib/snapshots"

type SnapshotHeaderRow = {
  source_id: string
  generation: string | number
  completed_at: string | Date
  schema_fingerprint: string
  coverage: SourceSnapshot["coverage"]
  window_start: string | Date
  window_end: string | Date
}

type SnapshotItemRow = {
  native_record_key: string
  parcel_id: string | null
  site_address: string | null
  source_event_at: string | Date | null
  source_updated_at: string | Date | null
  state: SnapshotState
  state_fingerprint: string
  first_seen_at: string | Date
  last_seen_at: string | Date
}

function iso(value: string | Date): string {
  return new Date(value).toISOString()
}

function optionalIso(value: string | Date | null): string | undefined {
  return value === null ? undefined : iso(value)
}

function storedRecord(row: SnapshotItemRow): StoredSnapshotRecord {
  return {
    nativeRecordKey: row.native_record_key,
    parcelId: row.parcel_id ?? undefined,
    siteAddress: row.site_address ?? undefined,
    sourceEventAt: optionalIso(row.source_event_at),
    sourceUpdatedAt: optionalIso(row.source_updated_at),
    state: row.state,
    stateFingerprint: row.state_fingerprint,
    firstSeenAt: iso(row.first_seen_at),
    lastSeenAt: iso(row.last_seen_at),
  }
}

async function rollback(client: PoolClient) {
  try { await client.query("ROLLBACK") } catch { /* The original transaction error is authoritative. */ }
}

export class PostgresSnapshotStore implements OperationalSnapshotStore {
  async load(sourceId: string): Promise<SourceSnapshot | null> {
    return withDatabaseClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      try {
        const headerResult = await client.query<SnapshotHeaderRow>(
          `select source_id, generation, completed_at, schema_fingerprint, coverage, window_start, window_end
             from source_snapshots where source_id = $1`,
          [sourceId],
        )
        const header = headerResult.rows[0]
        if (!header) {
          await client.query("COMMIT")
          return null
        }
        const itemResult = await client.query<SnapshotItemRow>(
          `select native_record_key, parcel_id, site_address, source_event_at, source_updated_at,
                  state, state_fingerprint, first_seen_at, last_seen_at
             from source_snapshot_items where source_id = $1 order by native_record_key`,
          [sourceId],
        )
        await client.query("COMMIT")
        return {
          version: 1,
          sourceId: header.source_id,
          generation: Number(header.generation),
          completedAt: iso(header.completed_at),
          schemaFingerprint: header.schema_fingerprint,
          coverage: header.coverage,
          windowStart: iso(header.window_start),
          windowEnd: iso(header.window_end),
          records: itemResult.rows.map(storedRecord),
        }
      } catch (error) {
        await rollback(client)
        throw error
      }
    })
  }

  async commit(sourceId: string, expectedGeneration: number, next: SourceSnapshot, transitions: SnapshotTransition[]): Promise<void> {
    await withDatabaseClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
      try {
        const generationResult = await client.query<{ generation: string | number }>(
          "select generation from source_snapshots where source_id = $1 for update",
          [sourceId],
        )
        const currentGeneration = generationResult.rows[0] ? Number(generationResult.rows[0].generation) : 0
        if (currentGeneration !== expectedGeneration) throw new Error(`Snapshot generation conflict for ${sourceId}`)

        await client.query(
          `insert into source_snapshots
             (source_id, generation, completed_at, schema_fingerprint, coverage, window_start, window_end)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (source_id) do update set
             generation = excluded.generation,
             completed_at = excluded.completed_at,
             schema_fingerprint = excluded.schema_fingerprint,
             coverage = excluded.coverage,
             window_start = excluded.window_start,
             window_end = excluded.window_end`,
          [sourceId, next.generation, next.completedAt, next.schemaFingerprint, next.coverage, next.windowStart, next.windowEnd],
        )

        if (next.records.length) {
          await client.query(
            `insert into source_snapshot_items
               (source_id, native_record_key, parcel_id, site_address, source_event_at, source_updated_at,
                state, state_fingerprint, first_seen_at, last_seen_at)
             select $1, item.native_record_key, item.parcel_id, item.site_address,
                    item.source_event_at, item.source_updated_at, item.state,
                    item.state_fingerprint, item.first_seen_at, item.last_seen_at
               from jsonb_to_recordset($2::jsonb) as item(
                 native_record_key text, parcel_id text, site_address text,
                 source_event_at timestamptz, source_updated_at timestamptz,
                 state jsonb, state_fingerprint text, first_seen_at timestamptz, last_seen_at timestamptz)
             on conflict (source_id, native_record_key) do update set
               parcel_id = excluded.parcel_id,
               site_address = excluded.site_address,
               source_event_at = excluded.source_event_at,
               source_updated_at = excluded.source_updated_at,
               state = excluded.state,
               state_fingerprint = excluded.state_fingerprint,
               first_seen_at = source_snapshot_items.first_seen_at,
               last_seen_at = excluded.last_seen_at`,
            [sourceId, JSON.stringify(next.records.map((record) => ({
              native_record_key: record.nativeRecordKey,
              parcel_id: record.parcelId ?? null,
              site_address: record.siteAddress ?? null,
              source_event_at: record.sourceEventAt ?? null,
              source_updated_at: record.sourceUpdatedAt ?? null,
              state: record.state,
              state_fingerprint: record.stateFingerprint,
              first_seen_at: record.firstSeenAt,
              last_seen_at: record.lastSeenAt,
            })))],
          )
        }

        if (transitions.length) {
          await client.query(
            `insert into event_transitions
               (transition_id, source_id, native_record_key, parcel_id, site_address, event_type,
                event_date, event_clock_basis, first_seen_at, source_updated_at, before_fingerprint,
                after_fingerprint, before_state, after_state)
             select item.transition_id, item.source_id, item.native_record_key, item.parcel_id,
                    item.site_address, item.event_type, item.event_date, item.event_clock_basis,
                    item.first_seen_at, item.source_updated_at, item.before_fingerprint,
                    item.after_fingerprint, item.before_state, item.after_state
               from jsonb_to_recordset($1::jsonb) as item(
                 transition_id text, source_id text, native_record_key text, parcel_id text,
                 site_address text, event_type text, event_date timestamptz, event_clock_basis text,
                 first_seen_at timestamptz, source_updated_at timestamptz, before_fingerprint text,
                 after_fingerprint text, before_state jsonb, after_state jsonb)
             on conflict (transition_id) do nothing`,
            [JSON.stringify(transitions.map((transition) => ({
              transition_id: transition.transitionId,
              source_id: transition.sourceId,
              native_record_key: transition.nativeRecordKey,
              parcel_id: transition.parcelId ?? null,
              site_address: transition.siteAddress ?? null,
              event_type: transition.eventType,
              event_date: transition.eventDate,
              event_clock_basis: transition.eventClockBasis,
              first_seen_at: transition.firstSeenAt,
              source_updated_at: transition.sourceUpdatedAt ?? null,
              before_fingerprint: transition.beforeFingerprint ?? null,
              after_fingerprint: transition.afterFingerprint,
              before_state: transition.before ?? null,
              after_state: transition.after,
            })))],
          )
        }
        await client.query("COMMIT")
      } catch (error) {
        await rollback(client)
        throw error
      }
    })
  }

  async acquireLease(sourceId: string, owner: string, ttlSeconds: number): Promise<boolean> {
    return withDatabaseClient(async (client) => {
      const result = await client.query(
        `insert into source_leases (source_id, lease_owner, lease_expires_at, updated_at)
         values ($1,$2,now() + make_interval(secs => $3),now())
         on conflict (source_id) do update set
           lease_owner = excluded.lease_owner,
           lease_expires_at = excluded.lease_expires_at,
           updated_at = now()
         where source_leases.lease_expires_at < now() or source_leases.lease_owner = excluded.lease_owner
         returning source_id`,
        [sourceId, owner, ttlSeconds],
      )
      return result.rowCount === 1
    })
  }

  async releaseLease(sourceId: string, owner: string): Promise<void> {
    await withDatabaseClient(async (client) => {
      await client.query("delete from source_leases where source_id = $1 and lease_owner = $2", [sourceId, owner])
    })
  }

  async recordRun(run: SourceRunAudit): Promise<void> {
    await withDatabaseClient(async (client) => {
      if (run.status === "RUNNING") {
        await client.query(
          `insert into source_runs (run_id, source_id, status, window_start, window_end, started_at)
           values ($1,$2,'RUNNING',$3,$4,$5)
           on conflict (run_id) do nothing`,
          [run.runId, run.sourceId, run.windowStart, run.windowEnd, run.startedAt],
        )
        return
      }
      await client.query(
        `insert into source_runs
           (run_id, source_id, status, window_start, window_end, started_at, completed_at,
            schema_fingerprint, records_observed, transitions_emitted, error_code, error_message)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (run_id) do update set
           status = excluded.status,
           completed_at = excluded.completed_at,
           schema_fingerprint = excluded.schema_fingerprint,
           records_observed = excluded.records_observed,
           transitions_emitted = excluded.transitions_emitted,
           error_code = excluded.error_code,
           error_message = excluded.error_message`,
        [run.runId, run.sourceId, run.status, run.windowStart, run.windowEnd, run.startedAt, run.completedAt,
          run.schemaFingerprint ?? null, run.recordsObserved ?? 0, run.transitionsEmitted ?? 0,
          run.errorCode ?? null, run.errorMessage ?? null],
      )
    })
  }
}

export type OperationsRow = {
  sourceId: string
  status: "RUNNING" | "SUCCEEDED" | "FAILED"
  checkedAt: string
  recordsObserved: number
  transitionsEmitted: number
  durationMs: number | null
  generation: number | null
}

export async function readLatestOperations(): Promise<OperationsRow[]> {
  return withDatabaseClient(async (client) => {
    const result = await client.query<{
      source_id: string
      status: OperationsRow["status"]
      checked_at: string | Date
      records_observed: number
      transitions_emitted: number
      duration_ms: string | number | null
      generation: string | number | null
    }>(
      `select distinct on (runs.source_id)
         runs.source_id, runs.status, coalesce(runs.completed_at, runs.started_at) as checked_at,
         runs.records_observed, runs.transitions_emitted,
         case when runs.completed_at is null then null else extract(epoch from (runs.completed_at-runs.started_at))*1000 end as duration_ms,
         snapshots.generation
       from source_runs runs
       left join source_snapshots snapshots on snapshots.source_id = runs.source_id
       order by runs.source_id, runs.started_at desc`,
    )
    return result.rows.map((row) => ({
      sourceId: row.source_id,
      status: row.status,
      checkedAt: iso(row.checked_at),
      recordsObserved: Number(row.records_observed),
      transitionsEmitted: Number(row.transitions_emitted),
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      generation: row.generation === null ? null : Number(row.generation),
    }))
  })
}
