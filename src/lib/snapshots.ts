import { createHash } from "node:crypto"
import type { EventType } from "@/lib/acrebrief"

export type SnapshotCoverage = "FULL" | "DELTA" | "WATCHLIST"
export type SnapshotScalar = string | number | boolean | null
export type SnapshotState = Record<string, SnapshotScalar>

export interface SnapshotRecordInput {
  nativeRecordKey: string
  parcelId?: string
  siteAddress?: string
  sourceEventAt?: string
  sourceUpdatedAt?: string
  state: SnapshotState
}

export interface StoredSnapshotRecord extends SnapshotRecordInput {
  stateFingerprint: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface SourceSnapshot {
  version: 1
  sourceId: string
  generation: number
  completedAt: string
  schemaFingerprint: string
  coverage: SnapshotCoverage
  windowStart: string
  windowEnd: string
  records: StoredSnapshotRecord[]
}

export interface SnapshotCollection {
  sourceId: string
  collectedAt: string
  schemaFingerprint: string
  coverage: SnapshotCoverage
  windowStart: string
  windowEnd: string
  records: SnapshotRecordInput[]
}

export interface SnapshotTransition {
  transitionId: string
  sourceId: string
  nativeRecordKey: string
  parcelId?: string
  siteAddress?: string
  eventType: EventType
  eventDate: string
  eventClockBasis: "SOURCE_EVENT" | "SOURCE_UPDATE" | "ACREBRIEF_DETECTION"
  firstSeenAt: string
  sourceUpdatedAt?: string
  beforeFingerprint?: string
  afterFingerprint: string
  before?: SnapshotState
  after: SnapshotState
}

export interface SnapshotReconciliation {
  bootstrap: boolean
  unchanged: number
  transitions: SnapshotTransition[]
  next: SourceSnapshot
}

export type TransitionClassifier = (
  previous: StoredSnapshotRecord | undefined,
  current: StoredSnapshotRecord,
  context: { collectedAt: string; windowStart: string; windowEnd: string },
) => Array<{ eventType: EventType; eventDate: string; eventClockBasis: SnapshotTransition["eventClockBasis"] }>

function canonicalize(value: SnapshotState): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))))
}

export function fingerprintSnapshotState(state: SnapshotState): string {
  return createHash("sha256").update(canonicalize(state)).digest("hex")
}

function transitionId(sourceId: string, nativeRecordKey: string, eventType: EventType, eventDate: string, beforeFingerprint: string | undefined, afterFingerprint: string): string {
  return `transition_${createHash("sha256").update([sourceId, nativeRecordKey, eventType, eventDate, beforeFingerprint ?? "bootstrap", afterFingerprint].join("|")).digest("hex").slice(0, 24)}`
}

function validateCollection(collection: SnapshotCollection): void {
  if (!collection.sourceId.trim()) throw new Error("Snapshot collection is missing sourceId")
  if (!/^[a-f0-9]{64}$/.test(collection.schemaFingerprint)) throw new Error("Snapshot collection has an invalid schema fingerprint")
  const start = new Date(collection.windowStart).getTime()
  const end = new Date(collection.windowEnd).getTime()
  const collected = new Date(collection.collectedAt).getTime()
  if (![start, end, collected].every(Number.isFinite) || start >= end || collected < start) throw new Error("Snapshot collection has invalid clocks")
  const keys = new Set<string>()
  for (const record of collection.records) {
    if (!record.nativeRecordKey.trim()) throw new Error("Snapshot record is missing its native key")
    if (keys.has(record.nativeRecordKey)) throw new Error(`Snapshot collection contains duplicate native key ${record.nativeRecordKey}`)
    keys.add(record.nativeRecordKey)
    if (record.parcelId && !/^\d{6}[A-Z]\d{10}$/.test(record.parcelId)) throw new Error(`Snapshot record ${record.nativeRecordKey} has an invalid parcel identifier`)
    if (record.sourceEventAt && !Number.isFinite(new Date(record.sourceEventAt).getTime())) throw new Error(`Snapshot record ${record.nativeRecordKey} has an invalid source event clock`)
    if (record.sourceUpdatedAt && !Number.isFinite(new Date(record.sourceUpdatedAt).getTime())) throw new Error(`Snapshot record ${record.nativeRecordKey} has an invalid source update clock`)
  }
}

/**
 * Reconciles one complete, validated source collection. Omitted records are
 * retained and never interpreted as closures: filtered/delta collection cannot
 * prove deletion, and a government source disappearing a row is not a business
 * event by itself.
 */
export function reconcileSnapshot(previous: SourceSnapshot | null, collection: SnapshotCollection, classify: TransitionClassifier): SnapshotReconciliation {
  validateCollection(collection)
  if (previous?.sourceId !== undefined && previous.sourceId !== collection.sourceId) throw new Error("Snapshot source mismatch")
  // Deliberate lookback overlap is required for sources that publish late or
  // correct records after their first appearance. The end watermark must still
  // advance so a replayed/stale collection cannot replace newer state.
  if (previous && new Date(collection.windowEnd).getTime() <= new Date(previous.windowEnd).getTime()) throw new Error("Snapshot collection does not advance the committed watermark")

  const bootstrap = previous === null
  const previousByKey = new Map(previous?.records.map((record) => [record.nativeRecordKey, record]) ?? [])
  const nextByKey = new Map(previousByKey)
  const transitions: SnapshotTransition[] = []
  let unchanged = 0

  for (const input of collection.records) {
    const prior = previousByKey.get(input.nativeRecordKey)
    const stateFingerprint = fingerprintSnapshotState(input.state)
    const current: StoredSnapshotRecord = {
      ...input,
      stateFingerprint,
      firstSeenAt: prior?.firstSeenAt ?? collection.collectedAt,
      lastSeenAt: collection.collectedAt,
    }
    nextByKey.set(input.nativeRecordKey, current)
    if (prior?.stateFingerprint === stateFingerprint) {
      unchanged += 1
      continue
    }
    if (bootstrap) continue
    for (const classified of classify(prior, current, { collectedAt: collection.collectedAt, windowStart: collection.windowStart, windowEnd: collection.windowEnd })) {
      transitions.push({
        transitionId: transitionId(collection.sourceId, input.nativeRecordKey, classified.eventType, classified.eventDate, prior?.stateFingerprint, stateFingerprint),
        sourceId: collection.sourceId,
        nativeRecordKey: input.nativeRecordKey,
        parcelId: input.parcelId,
        siteAddress: input.siteAddress,
        eventType: classified.eventType,
        eventDate: classified.eventDate,
        eventClockBasis: classified.eventClockBasis,
        firstSeenAt: collection.collectedAt,
        sourceUpdatedAt: input.sourceUpdatedAt,
        beforeFingerprint: prior?.stateFingerprint,
        afterFingerprint: stateFingerprint,
        before: prior?.state,
        after: input.state,
      })
    }
  }

  return {
    bootstrap,
    unchanged,
    transitions,
    next: {
      version: 1,
      sourceId: collection.sourceId,
      generation: (previous?.generation ?? 0) + 1,
      completedAt: collection.collectedAt,
      schemaFingerprint: collection.schemaFingerprint,
      coverage: collection.coverage,
      windowStart: collection.windowStart,
      windowEnd: collection.windowEnd,
      records: [...nextByKey.values()].sort((left, right) => left.nativeRecordKey.localeCompare(right.nativeRecordKey)),
    },
  }
}

export interface SnapshotStore {
  load(sourceId: string): Promise<SourceSnapshot | null>
  commit(sourceId: string, expectedGeneration: number, next: SourceSnapshot, transitions: SnapshotTransition[]): Promise<void>
}

export interface SourceRunAudit {
  runId: string
  sourceId: string
  status: "RUNNING" | "SUCCEEDED" | "FAILED"
  windowStart: string
  windowEnd: string
  startedAt: string
  completedAt?: string
  schemaFingerprint?: string
  recordsObserved?: number
  transitionsEmitted?: number
  errorCode?: string
  errorMessage?: string
}

export interface OperationalSnapshotStore extends SnapshotStore {
  acquireLease(sourceId: string, owner: string, ttlSeconds: number): Promise<boolean>
  releaseLease(sourceId: string, owner: string): Promise<void>
  recordRun(run: SourceRunAudit): Promise<void>
}

export function isOperationalSnapshotStore(store: SnapshotStore): store is OperationalSnapshotStore {
  const candidate = store as Partial<OperationalSnapshotStore>
  return typeof candidate.acquireLease === "function" && typeof candidate.releaseLease === "function" && typeof candidate.recordRun === "function"
}

export class InMemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new Map<string, SourceSnapshot>()
  private readonly emittedTransitionIds = new Set<string>()
  readonly transitions: SnapshotTransition[] = []

  async load(sourceId: string): Promise<SourceSnapshot | null> {
    return structuredClone(this.snapshots.get(sourceId) ?? null)
  }

  async commit(sourceId: string, expectedGeneration: number, next: SourceSnapshot, transitions: SnapshotTransition[]): Promise<void> {
    const currentGeneration = this.snapshots.get(sourceId)?.generation ?? 0
    if (currentGeneration !== expectedGeneration) throw new Error(`Snapshot generation conflict for ${sourceId}`)
    for (const transition of transitions) {
      if (this.emittedTransitionIds.has(transition.transitionId)) continue
      this.emittedTransitionIds.add(transition.transitionId)
      this.transitions.push(structuredClone(transition))
    }
    this.snapshots.set(sourceId, structuredClone(next))
  }
}

export async function commitCollection(store: SnapshotStore, collection: SnapshotCollection, classify: TransitionClassifier): Promise<SnapshotReconciliation> {
  const previous = await store.load(collection.sourceId)
  const reconciliation = reconcileSnapshot(previous, collection, classify)
  await store.commit(collection.sourceId, previous?.generation ?? 0, reconciliation.next, reconciliation.transitions)
  return reconciliation
}
