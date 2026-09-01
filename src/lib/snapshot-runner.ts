import { randomUUID } from "node:crypto"
import {
  CAPE_CORAL_BUILDING_PERMITS,
  CAPE_CORAL_CODE_CASES,
  CAPE_CORAL_PAYOFF,
  CAPE_CORAL_UTILITY_LIENS,
  collectCapeCoralSnapshot,
  type CapeCoralSourceDefinition,
} from "@/lib/cape-coral-events"
import { commitCollection, isOperationalSnapshotStore, type SnapshotStore, type SnapshotTransition } from "@/lib/snapshots"

export interface SourceRunResult {
  sourceId: string
  status: "SUCCEEDED" | "FAILED" | "SKIPPED"
  bootstrap: boolean
  windowStart: string
  windowEnd: string
  recordsObserved: number
  recordsUnchanged: number
  transitions: SnapshotTransition[]
  durationMs: number
  error?: string
}

export interface EventStreamRun {
  startedAt: string
  completedAt: string
  status: "SUCCEEDED" | "PARTIAL" | "FAILED"
  sources: SourceRunResult[]
  transitions: SnapshotTransition[]
}

interface RunnerOptions {
  store: SnapshotStore
  now?: Date
  lookbackHours?: number
  bootstrapHours?: number
  watchlistParcelIds?: readonly string[]
  fetch?: typeof fetch
  signal?: AbortSignal
  definitions?: readonly CapeCoralSourceDefinition[]
}

const DEFAULT_SOURCES = [CAPE_CORAL_CODE_CASES, CAPE_CORAL_UTILITY_LIENS, CAPE_CORAL_BUILDING_PERMITS] as const

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown source failure"
  return message.replace(/https?:\/\/\S+/gi, "[source-url-redacted]").slice(0, 500)
}

/**
 * Runs each source as an independent transaction. A failed fetch, partial page,
 * schema change, or generation conflict never advances that source's watermark
 * and never prevents another source from committing successfully.
 */
export async function runCapeCoralEventStream(options: RunnerOptions): Promise<EventStreamRun> {
  const now = options.now ?? new Date()
  const startedAt = new Date().toISOString()
  const lookbackMs = (options.lookbackHours ?? 6) * 60 * 60 * 1_000
  const bootstrapMs = (options.bootstrapHours ?? 24) * 60 * 60 * 1_000
  const definitions = [...(options.definitions ?? DEFAULT_SOURCES)]
  if (options.watchlistParcelIds?.length) definitions.push(CAPE_CORAL_PAYOFF)

  const sources = await Promise.all(definitions.map(async (definition): Promise<SourceRunResult> => {
    const sourceStarted = Date.now()
    const runId = randomUUID()
    const startedAt = new Date().toISOString()
    const operationalStore = isOperationalSnapshotStore(options.store) ? options.store : undefined
    let leaseAcquired = false
    let previous = null as Awaited<ReturnType<SnapshotStore["load"]>>
    let windowStart = new Date(now.getTime() - bootstrapMs)
    try {
      if (operationalStore) {
        leaseAcquired = await operationalStore.acquireLease(definition.sourceId, runId, 600)
        if (!leaseAcquired) return { sourceId: definition.sourceId, status: "SKIPPED", bootstrap: false, windowStart: now.toISOString(), windowEnd: now.toISOString(), recordsObserved: 0, recordsUnchanged: 0, transitions: [], durationMs: Date.now() - sourceStarted, error: "Another run owns the source lease." }
      }
      previous = await options.store.load(definition.sourceId)
      const previousEnd = previous ? new Date(previous.windowEnd).getTime() : undefined
      if (previous && previousEnd !== undefined && previousEnd >= now.getTime()) {
        return { sourceId: definition.sourceId, status: "SKIPPED", bootstrap: false, windowStart: previous.windowStart, windowEnd: previous.windowEnd, recordsObserved: 0, recordsUnchanged: 0, transitions: [], durationMs: Date.now() - sourceStarted }
      }
      windowStart = new Date(previousEnd === undefined ? now.getTime() - bootstrapMs : previousEnd - lookbackMs)
      await operationalStore?.recordRun({ runId, sourceId: definition.sourceId, status: "RUNNING", windowStart: windowStart.toISOString(), windowEnd: now.toISOString(), startedAt })
      const collection = await collectCapeCoralSnapshot(definition, {
        windowStart,
        windowEnd: now,
        collectedAt: now,
        parcelIds: definition.coverage === "WATCHLIST" ? options.watchlistParcelIds : undefined,
        fetch: options.fetch,
        signal: options.signal,
      })
      const reconciliation = await commitCollection(options.store, collection, definition.classify)
      await operationalStore?.recordRun({ runId, sourceId: definition.sourceId, status: "SUCCEEDED", windowStart: collection.windowStart, windowEnd: collection.windowEnd, startedAt, completedAt: new Date().toISOString(), schemaFingerprint: collection.schemaFingerprint, recordsObserved: collection.records.length, transitionsEmitted: reconciliation.transitions.length })
      return {
        sourceId: definition.sourceId,
        status: "SUCCEEDED",
        bootstrap: reconciliation.bootstrap,
        windowStart: collection.windowStart,
        windowEnd: collection.windowEnd,
        recordsObserved: collection.records.length,
        recordsUnchanged: reconciliation.unchanged,
        transitions: reconciliation.transitions,
        durationMs: Date.now() - sourceStarted,
      }
    } catch (error) {
      const errorMessage = safeError(error)
      try {
        await operationalStore?.recordRun({ runId, sourceId: definition.sourceId, status: "FAILED", windowStart: windowStart.toISOString(), windowEnd: now.toISOString(), startedAt, completedAt: new Date().toISOString(), recordsObserved: 0, transitionsEmitted: 0, errorCode: "SOURCE_RUN_FAILED", errorMessage })
      } catch { /* Snapshot state remains authoritative if audit persistence fails. */ }
      return {
        sourceId: definition.sourceId,
        status: "FAILED",
        bootstrap: previous === null,
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
        recordsObserved: 0,
        recordsUnchanged: 0,
        transitions: [],
        durationMs: Date.now() - sourceStarted,
        error: errorMessage,
      }
    } finally {
      if (operationalStore && leaseAcquired) {
        try { await operationalStore.releaseLease(definition.sourceId, runId) } catch { /* Lease expiry recovers a failed release. */ }
      }
    }
  }))

  const succeeded = sources.filter((source) => source.status === "SUCCEEDED").length
  const failed = sources.filter((source) => source.status === "FAILED").length
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    status: failed === 0 ? "SUCCEEDED" : succeeded > 0 ? "PARTIAL" : "FAILED",
    sources,
    transitions: sources.flatMap((source) => source.transitions),
  }
}
