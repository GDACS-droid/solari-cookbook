/**
 * AcreBrief's evidence-first domain boundary.  This module deliberately keeps
 * public-record observations separate from derived signals: a candidate join
 * never silently becomes a fact, and a missing field is never scored as zero.
 */
import { createHash } from "node:crypto"

export const ADAPTER_VERSION = "2026.09.01"

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNRESOLVED"
export type MatchKind = "EXACT" | "CANDIDATE" | "UNRESOLVED"
export type EventType =
  | "NEW_LIS_PENDENS"
  | "NEW_FORECLOSURE_CASE"
  | "NEW_FORECLOSURE_REGISTRATION"
  | "FORECLOSURE_REGISTRATION_OPENED"
  | "FORECLOSURE_NOTICE_PUBLISHED"
  | "FORECLOSURE_SALE_NOTICE_PUBLISHED"
  | "NEW_LIEN"
  | "LIEN_STATUS_ACTIVE"
  | "LIEN_RELEASED"
  | "NEW_TAX_DELINQUENCY"
  | "NEW_TAX_DEED_APPLICATION"
  | "AUCTION_SCHEDULED"
  | "AUCTION_POSTPONED"
  | "AUCTION_CANCELLED"
  | "NEW_JUDGMENT"
  | "PROPERTY_TRANSFERRED"
  | "NEW_PERMIT_PROBLEM"
  | "CODE_VIOLATION_OPENED"
  | "CODE_VIOLATION_CLOSED"

export interface Evidence {
  evidenceId: string
  sourceId: string
  sourceUrl: string
  retrievedAt: string
  /** Timestamp published by the source for its last material row update, when available. */
  sourceUpdatedAt?: string
  effectiveDate?: string
  rawValue: unknown
  normalizedValue?: unknown
  confidence: Confidence
  adapterVersion: string
  artifactUrl?: string
  note?: string
}

export interface Parcel {
  /** Present only after corroboration against a county parcel identifier. */
  parcelId?: string
  /** Stable internal handle for an unresolved/candidate property. */
  candidateId?: string
  county: "LEE" | "CHARLOTTE" | "COLLIER"
  countyParcelId?: string
  strap?: string
  siteAddress?: string
  normalizedAddress?: string
  legalDescription?: string
  assessment?: {
    year: number
    status: "PRELIMINARY" | "FINAL"
    justValue: number
    assessedValue: number
    taxableValue: number
    landValue: number
    actualYearBuilt: number | null
    livingAreaSquareFeet: number | null
    landUseCode: string
  }
}

export interface OwnerOrEntity {
  entityId: string
  displayName: string
  normalizedName: string
  kind: "PERSON" | "BUSINESS" | "UNKNOWN"
  /** No contact details belong in this public-demo model. */
}

export interface CourtCase {
  caseId: string
  courtCaseNumber: string
  county: Parcel["county"]
  caseType?: string
  filedAt?: string
}

export interface PropertyEvent {
  eventId: string
  eventType: EventType
  propertyId?: string
  candidatePropertyId?: string
  /** Stable native reference from the source adapter; required for idempotency. */
  sourceRecordId: string
  caseId?: string
  recordedDocumentId?: string
  eventDate: string
  /** First successful AcreBrief observation; distinct from the source event date. */
  firstSeenAt: string
  /** @deprecated Use firstSeenAt. Retained for serialized-client compatibility. */
  detectedAt: string
  match: MatchKind
  confidence: Confidence
  evidenceIds: string[]
  rawFingerprint: string
}

export interface PropertyGraph {
  property: Parcel
  owners: OwnerOrEntity[]
  courtCases: CourtCase[]
  events: PropertyEvent[]
  evidence: Evidence[]
}

export interface ScoreReason {
  points: number
  label: string
  sourceEventId?: string
}

export interface OpportunityScore {
  score: number
  confidence: Confidence
  reasons: ScoreReason[]
  unknown: string[]
  disclaimer: string
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20)
const stable = (parts: Array<string | undefined>) => parts.filter(Boolean).join("|")
export const stableId = (kind: string, ...parts: Array<string | undefined>) => `${kind}_${hash(stable(parts))}`

export function normalizeAddress(value: string): string {
  return value
    .toUpperCase()
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeEntityName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\b(L\.?L\.?C\.?|INC\.?|CORP\.?|LTD\.?)\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Exact only for a county identifier; address-only work always queues review. */
export function resolveParcel(
  candidate: Pick<Parcel, "county" | "countyParcelId" | "strap" | "siteAddress">,
  known: Parcel[],
): { kind: MatchKind; confidence: Confidence; parcel?: Parcel; candidates: Parcel[] } {
  const identifiers = [candidate.countyParcelId, candidate.strap].filter(Boolean)
  const exactById = known.filter(
    (parcel) => parcel.county === candidate.county && identifiers.some((id) => id === parcel.countyParcelId || id === parcel.strap),
  )
  if (exactById.length === 1) return { kind: "EXACT", confidence: "HIGH", parcel: exactById[0], candidates: exactById }
  const address = candidate.siteAddress ? normalizeAddress(candidate.siteAddress) : undefined
  const exactByAddress = address ? known.filter((parcel) => parcel.county === candidate.county && parcel.normalizedAddress === address) : []
  if (exactByAddress.length === 1) return { kind: "CANDIDATE", confidence: "MEDIUM", candidates: exactByAddress }
  const tokens = address?.split(" ").filter((token) => token.length > 2) ?? []
  const candidates = tokens.length ? known.filter((parcel) => parcel.county === candidate.county && tokens.every((token) => parcel.normalizedAddress?.includes(token))) : []
  return { kind: candidates.length ? "CANDIDATE" : "UNRESOLVED", confidence: candidates.length ? "LOW" : "UNRESOLVED", candidates }
}

export function fingerprintEvent(input: Pick<PropertyEvent, "eventType" | "eventDate" | "caseId" | "recordedDocumentId" | "propertyId" | "candidatePropertyId" | "sourceRecordId">): string {
  // Pick fields explicitly: callers often pass a complete event object, whose
  // generated id/evidence timestamps must never change idempotency semantics.
  return hash(JSON.stringify({
    eventType: input.eventType,
    eventDate: input.eventDate.slice(0, 10),
    caseId: input.caseId,
    recordedDocumentId: input.recordedDocumentId,
    propertyId: input.propertyId,
    candidatePropertyId: input.candidatePropertyId,
    sourceRecordId: input.sourceRecordId,
  }))
}

export function diffEvents(previous: PropertyEvent[], current: PropertyEvent[]): { added: PropertyEvent[]; unchanged: PropertyEvent[] } {
  const prior = new Set(previous.map((event) => event.rawFingerprint))
  return current.reduce<{ added: PropertyEvent[]; unchanged: PropertyEvent[] }>((result, event) => {
    result[prior.has(event.rawFingerprint) ? "unchanged" : "added"].push(event)
    return result
  }, { added: [], unchanged: [] })
}

export function scoreOpportunity(graph: PropertyGraph, now = new Date()): OpportunityScore {
  const reasons: ScoreReason[] = []
  const unknown: string[] = []
  let score = 0
  const add = (points: number, label: string, sourceEventId?: string) => { score += points; reasons.push({ points, label, sourceEventId }) }
  const eventTypes = new Set(graph.events.map((event) => event.eventType))
  for (const event of graph.events) {
    const ageDays = Math.floor((now.getTime() - new Date(event.eventDate).getTime()) / 86_400_000)
    // Future effective dates are not fresh detections. They may be scored by
    // their explicit event family below, but never earn a false recency bonus.
    if (event.eventType !== "LIEN_STATUS_ACTIVE" && ageDays >= 0 && ageDays <= 7) {
      const recencyLabel = event.eventType === "NEW_FORECLOSURE_REGISTRATION" || event.eventType === "FORECLOSURE_REGISTRATION_OPENED"
        ? "Recent foreclosure registration source event"
        : `New ${event.eventType.replaceAll("_", " ").toLowerCase()} signal`
      add(18, `${recencyLabel} (${ageDays}d)`, event.eventId)
    }
  }
  if (eventTypes.has("NEW_FORECLOSURE_CASE")) add(16, "Foreclosure case signal")
  if (eventTypes.has("NEW_FORECLOSURE_REGISTRATION") || eventTypes.has("FORECLOSURE_REGISTRATION_OPENED")) add(14, "Vacant-property foreclosure registration signal")
  if (eventTypes.has("FORECLOSURE_NOTICE_PUBLISHED")) add(10, "Foreclosure notice published")
  if (eventTypes.has("FORECLOSURE_SALE_NOTICE_PUBLISHED")) add(12, "Foreclosure sale notice published")
  if (eventTypes.has("NEW_LIS_PENDENS")) add(14, "Lis pendens recorded")
  if (eventTypes.has("NEW_TAX_DELINQUENCY")) add(12, "Tax delinquency signal")
  if (eventTypes.has("NEW_LIEN")) add(10, "Recorded lien signal")
  if (eventTypes.has("LIEN_STATUS_ACTIVE")) add(10, "Municipal lien reported active")
  if (eventTypes.has("AUCTION_SCHEDULED")) add(12, "Auction scheduled")
  if (!graph.events.some((event) => event.match === "EXACT")) unknown.push("Property resolution remains in the review queue")
  if (!eventTypes.has("NEW_TAX_DELINQUENCY") && !eventTypes.has("NEW_TAX_DEED_APPLICATION")) unknown.push("Current tax balance unavailable from this investigation")
  unknown.push("Current mortgage payoff and equity are not available in this public-record sample")
  const confidence: Confidence = graph.events.some((event) => event.match === "UNRESOLVED")
    ? "UNRESOLVED"
    : graph.events.every((event) => event.confidence === "HIGH") ? "HIGH" : "MEDIUM"
  return {
    score: Math.min(score, 100), confidence, reasons,
    unknown,
    disclaimer: "Decision support only. A public-record event is not proof of distress, equity, title condition, or willingness to sell.",
  }
}

export interface AdapterMetrics {
  sourceId: string
  status: "HEALTHY" | "DEGRADED" | "FAILED"
  attempts: number
  durationMs: number
  eventsProduced: number
  recordsDeduplicated: number
  schemaFingerprint?: string
  schemaChanged: boolean
  error?: string
}

export interface SourceAdapter<RawRecord> {
  readonly sourceId: string
  readonly allowedOrigins: readonly string[]
  discover(startTime: Date, endTime: Date): Promise<RawRecord[]>
  fetch(recordRef: string): Promise<RawRecord>
  normalize(raw: RawRecord): Promise<PropertyEvent[]>
  resolve(record: PropertyEvent): Promise<PropertyEvent>
  evidence(record: PropertyEvent): Promise<Evidence[]>
  healthcheck(): Promise<{ ok: boolean; schema?: unknown }>
}

export async function runAdapter<RawRecord>(adapter: SourceAdapter<RawRecord>, start: Date, end: Date, previous: PropertyEvent[], maxAttempts = 2, previousSchemaFingerprint?: string): Promise<{ events: PropertyEvent[]; metrics: AdapterMetrics }> {
  const started = Date.now()
  let attempts = 0
  let lastError: unknown
  while (attempts < maxAttempts) {
    attempts += 1
    try {
      const health = await adapter.healthcheck()
      if (!health.ok) throw new Error("healthcheck reported unavailable")
      const records = await adapter.discover(start, end)
      const normalized = (await Promise.all(records.map((record) => adapter.normalize(record)))).flat()
      const resolved = await Promise.all(normalized.map((event) => adapter.resolve(event)))
      const deduplicated = [...new Map(resolved.map((event) => [event.rawFingerprint, event])).values()]
      const diff = diffEvents(previous, deduplicated)
      const schemaFingerprint = health.schema ? hash(JSON.stringify(health.schema)) : undefined
      return { events: diff.added, metrics: { sourceId: adapter.sourceId, status: "HEALTHY", attempts, durationMs: Date.now() - started, eventsProduced: diff.added.length, recordsDeduplicated: resolved.length - deduplicated.length, schemaFingerprint, schemaChanged: Boolean(previousSchemaFingerprint && schemaFingerprint && previousSchemaFingerprint !== schemaFingerprint) } }
    } catch (error) {
      lastError = error
      if (attempts < maxAttempts) await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempts - 1), 1_000)))
    }
  }
  return { events: [], metrics: { sourceId: adapter.sourceId, status: "FAILED", attempts, durationMs: Date.now() - started, eventsProduced: 0, recordsDeduplicated: 0, schemaChanged: false, error: lastError instanceof Error ? lastError.message : "Unknown adapter failure" } }
}
