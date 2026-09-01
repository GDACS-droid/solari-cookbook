import { createHash } from "node:crypto"
import { z } from "zod"
import type { EventType } from "@/lib/acrebrief"
import { sourcePolicyAllows, sourceSnapshotRequestBudget, type RuntimeSourceId } from "@/lib/source-policy"
import type { SnapshotCollection, SnapshotRecordInput, TransitionClassifier } from "@/lib/snapshots"

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

interface ArcgisField {
  name: string
  type: string
}

interface ArcgisResponse {
  fields?: ArcgisField[]
  features?: Array<{ attributes?: unknown }>
  exceededTransferLimit?: boolean
  error?: { code?: number; message?: string }
}

export interface CapeCoralSourceDefinition {
  sourceId: RuntimeSourceId
  queryUrl: string
  outFields: readonly string[]
  fieldTypes: Readonly<Record<string, string>>
  orderBy: string
  pageSize: number
  coverage: "DELTA" | "WATCHLIST"
  buildWhere(windowStart: Date, windowEnd: Date, parcelIds?: readonly string[]): string
  parse(attributes: unknown): SnapshotRecordInput
  classify: TransitionClassifier
}

const parcelPattern = /^\d{6}[A-Z]\d{10}$/
const optionalString = z.string().trim().max(500).nullable()
const optionalEpoch = z.number().int().min(Date.UTC(1900, 0, 1)).max(Date.UTC(2100, 0, 1)).nullable()

function iso(epoch: number | null): string | undefined {
  return epoch === null ? undefined : new Date(epoch).toISOString()
}

function parcel(...values: Array<string | null>): string | undefined {
  for (const value of values) {
    const normalized = value?.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    if (normalized && parcelPattern.test(normalized)) return normalized
  }
  return undefined
}

function sourceTimestamp(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`
}

function timeWindow(field: string, start: Date, end: Date): string {
  return `${field} >= TIMESTAMP '${sourceTimestamp(start)}' AND ${field} < TIMESTAMP '${sourceTimestamp(end)}'`
}

function schemaFingerprint(fields: readonly ArcgisField[]): string {
  const canonical = [...fields]
    .map(({ name, type }) => ({ name, type }))
    .sort((left, right) => left.name.localeCompare(right.name))
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

function expectedSchema(definition: CapeCoralSourceDefinition): ArcgisField[] {
  return definition.outFields.map((name) => ({ name, type: definition.fieldTypes[name] }))
}

function assertSchema(definition: CapeCoralSourceDefinition, fields: readonly ArcgisField[] | undefined): string {
  if (!fields) throw new Error(`${definition.sourceId} omitted its response schema`)
  const expected = schemaFingerprint(expectedSchema(definition))
  const received = schemaFingerprint(fields)
  if (received !== expected) throw new Error(`${definition.sourceId} schema changed; snapshot was not committed`)
  return received
}

function inWindow(value: string | number | boolean | null | undefined, context: { windowStart: string; windowEnd: string }): value is string {
  if (typeof value !== "string") return false
  const time = new Date(value).getTime()
  return time >= new Date(context.windowStart).getTime() && time < new Date(context.windowEnd).getTime()
}

function event(eventType: EventType, eventDate: string, eventClockBasis: "SOURCE_EVENT" | "SOURCE_UPDATE" | "ACREBRIEF_DETECTION") {
  return { eventType, eventDate, eventClockBasis }
}

const codeSchema = z.object({
  CMCODECASEID: z.string().trim().min(1).max(100),
  CaseNumber: z.string().trim().min(1).max(100),
  Status: optionalString,
  opened: optionalEpoch,
  closed: optionalEpoch,
  updated: optionalEpoch,
  CaseType: optionalString,
  CaseSubtype: optionalString,
  Main_Linked_Parcel: optionalString,
  STRAPGIS: optionalString,
  SiteAddressGIS: optionalString,
}).strict()

export const classifyCodeCase: TransitionClassifier = (previous, current, context) => {
  const closed = current.state.closedAt
  if (!previous) {
    if (inWindow(current.sourceEventAt, context)) {
      const eventType: EventType = current.state.caseType === "FORECLOSURE REGISTRATION" ? "NEW_FORECLOSURE_REGISTRATION" : "CODE_VIOLATION_OPENED"
      return [event(eventType, current.sourceEventAt, "SOURCE_EVENT")]
    }
    if (inWindow(closed, context)) return [event("CODE_CASE_CLOSED", closed, "SOURCE_EVENT")]
    if (current.sourceUpdatedAt) return [event("CODE_CASE_UPDATED", current.sourceUpdatedAt, "SOURCE_UPDATE")]
    return []
  }
  if (!previous.state.closedAt && typeof closed === "string") return [event("CODE_CASE_CLOSED", closed, "SOURCE_EVENT")]
  return current.sourceUpdatedAt ? [event("CODE_CASE_UPDATED", current.sourceUpdatedAt, "SOURCE_UPDATE")] : []
}

const lienSchema = z.object({
  Strap: z.string().trim().min(1).max(100),
  Date_Liened: optionalEpoch,
  Lien_Number: z.string().trim().min(1).max(100),
  Lien_Amount: z.number().finite().nonnegative().nullable(),
  Lien_Release_Date: optionalEpoch,
  Lien_Release_Number: optionalString,
  Active_Lien: optionalString,
  OBJECTID: z.number().int().nonnegative(),
}).strict()

export const classifyUtilityLien: TransitionClassifier = (previous, current, context) => {
  if (!previous) {
    if (inWindow(current.sourceEventAt, context)) return [event("NEW_UTILITY_LIEN", current.sourceEventAt, "SOURCE_EVENT")]
    if (inWindow(current.state.releaseAt, context)) return [event("LIEN_RELEASED", current.state.releaseAt, "SOURCE_EVENT")]
    return []
  }
  const transitions: ReturnType<TransitionClassifier> = []
  if (!previous.state.releaseAt && typeof current.state.releaseAt === "string") transitions.push(event("LIEN_RELEASED", current.state.releaseAt, "SOURCE_EVENT"))
  return transitions
}

const permitSchema = z.object({
  Permit_Number: z.string().trim().min(1).max(100),
  permit_status: optionalString,
  applydate: optionalEpoch,
  issuedate: optionalEpoch,
  finalizedate: optionalEpoch,
  last_insp_date: optionalEpoch,
  permitvalue: z.number().finite().nonnegative().nullable(),
  Permit_Type: optionalString,
  Friendly_Name: optionalString,
  Work_Class: optionalString,
  Parcel: optionalString,
  Addr1: optionalString,
  Predir: optionalString,
  Addr2: optionalString,
  Addr3: optionalString,
  Street_Type: optionalString,
  Post_Dir: optionalString,
  Unit: optionalString,
  City: optionalString,
  State: optionalString,
  Zip: optionalString,
  lastchangedon: optionalEpoch,
  expiredate: optionalEpoch,
}).strict()

export const classifyPermit: TransitionClassifier = (previous, current, context) => {
  if (!previous) {
    if (inWindow(current.sourceEventAt, context)) return [event("PERMIT_OPENED", current.sourceEventAt, "SOURCE_EVENT")]
    if (inWindow(current.state.finalizedAt, context)) return [event("PERMIT_FINALIZED", current.state.finalizedAt, "SOURCE_EVENT")]
    const unseenStatus = String(current.state.status ?? "").toUpperCase()
    if (unseenStatus.includes("EXPIRED") && current.sourceUpdatedAt) return [event("PERMIT_EXPIRED", current.sourceUpdatedAt, "SOURCE_UPDATE")]
    return current.sourceUpdatedAt ? [event("PERMIT_UPDATED", current.sourceUpdatedAt, "SOURCE_UPDATE")] : []
  }
  if (!previous.state.finalizedAt && typeof current.state.finalizedAt === "string") return [event("PERMIT_FINALIZED", current.state.finalizedAt, "SOURCE_EVENT")]
  const status = String(current.state.status ?? "").toUpperCase()
  if (previous.state.status !== current.state.status && status.includes("EXPIRED") && current.sourceUpdatedAt) return [event("PERMIT_EXPIRED", current.sourceUpdatedAt, "SOURCE_UPDATE")]
  if (previous.state.status !== current.state.status && current.sourceUpdatedAt) return [event("PERMIT_STATUS_CHANGED", current.sourceUpdatedAt, "SOURCE_UPDATE")]
  return current.sourceUpdatedAt ? [event("PERMIT_UPDATED", current.sourceUpdatedAt, "SOURCE_UPDATE")] : []
}

const payoffSchema = z.object({
  SVC: z.string().trim().min(1).max(100),
  STRAP: z.string().trim().min(1).max(100),
  currentamt: z.number().finite().nullable(),
  payoff: z.number().finite().nullable(),
  Hide: optionalString,
  Site_Address: optionalString,
  Geotype: optionalString,
  OBJECTID: z.number().int().nonnegative(),
}).strict()

export const classifyPayoff: TransitionClassifier = (previous, current, context) => {
  if (!previous) return []
  if (previous.state.currentAmount === current.state.currentAmount && previous.state.payoffAmount === current.state.payoffAmount) return []
  return [event("MUNICIPAL_PAYOFF_CHANGED", context.collectedAt, "ACREBRIEF_DETECTION")]
}

export const CAPE_CORAL_CODE_CASES: CapeCoralSourceDefinition = {
  sourceId: "cape_coral_open_data_code_cases",
  queryUrl: "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5/query",
  outFields: ["CMCODECASEID", "CaseNumber", "Status", "opened", "closed", "updated", "CaseType", "CaseSubtype", "Main_Linked_Parcel", "STRAPGIS", "SiteAddressGIS"],
  fieldTypes: { CMCODECASEID: "esriFieldTypeString", CaseNumber: "esriFieldTypeString", Status: "esriFieldTypeString", opened: "esriFieldTypeDate", closed: "esriFieldTypeDate", updated: "esriFieldTypeDate", CaseType: "esriFieldTypeString", CaseSubtype: "esriFieldTypeString", Main_Linked_Parcel: "esriFieldTypeString", STRAPGIS: "esriFieldTypeString", SiteAddressGIS: "esriFieldTypeString" },
  orderBy: "updated ASC,CMCODECASEID ASC",
  pageSize: 500,
  coverage: "DELTA",
  buildWhere: (start, end) => `(${timeWindow("updated", start, end)}) OR (${timeWindow("opened", start, end)})`,
  parse: (attributes) => {
    const row = codeSchema.parse(attributes)
    return {
      nativeRecordKey: row.CMCODECASEID,
      parcelId: parcel(row.Main_Linked_Parcel, row.STRAPGIS),
      siteAddress: row.SiteAddressGIS ?? undefined,
      sourceEventAt: iso(row.opened),
      sourceUpdatedAt: iso(row.updated),
      state: { caseNumber: row.CaseNumber, status: row.Status, openedAt: iso(row.opened) ?? null, closedAt: iso(row.closed) ?? null, updatedAt: iso(row.updated) ?? null, caseType: row.CaseType?.toUpperCase() ?? null, caseSubtype: row.CaseSubtype },
    }
  },
  classify: classifyCodeCase,
}

export const CAPE_CORAL_UTILITY_LIENS: CapeCoralSourceDefinition = {
  sourceId: "cape_coral_open_data_utility_liens",
  queryUrl: "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/6/query",
  outFields: ["Strap", "Date_Liened", "Lien_Number", "Lien_Amount", "Lien_Release_Date", "Lien_Release_Number", "Active_Lien", "OBJECTID"],
  fieldTypes: { Strap: "esriFieldTypeString", Date_Liened: "esriFieldTypeDate", Lien_Number: "esriFieldTypeString", Lien_Amount: "esriFieldTypeDouble", Lien_Release_Date: "esriFieldTypeDate", Lien_Release_Number: "esriFieldTypeString", Active_Lien: "esriFieldTypeString", OBJECTID: "esriFieldTypeInteger" },
  orderBy: "Date_Liened ASC,OBJECTID ASC",
  pageSize: 500,
  coverage: "DELTA",
  buildWhere: (start, end) => `(${timeWindow("Date_Liened", start, end)}) OR (${timeWindow("Lien_Release_Date", start, end)})`,
  parse: (attributes) => {
    const row = lienSchema.parse(attributes)
    return {
      nativeRecordKey: `${row.Strap.trim()}|${row.Lien_Number}`,
      parcelId: parcel(row.Strap),
      sourceEventAt: iso(row.Date_Liened),
      sourceUpdatedAt: iso(row.Lien_Release_Date) ?? iso(row.Date_Liened),
      state: { lienNumber: row.Lien_Number, amount: row.Lien_Amount, lienedAt: iso(row.Date_Liened) ?? null, releaseAt: iso(row.Lien_Release_Date) ?? null, releaseNumber: row.Lien_Release_Number, active: row.Active_Lien },
    }
  },
  classify: classifyUtilityLien,
}

export const CAPE_CORAL_BUILDING_PERMITS: CapeCoralSourceDefinition = {
  sourceId: "cape_coral_open_data_building_permits",
  queryUrl: "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/1/query",
  outFields: ["Permit_Number", "permit_status", "applydate", "issuedate", "finalizedate", "last_insp_date", "permitvalue", "Permit_Type", "Friendly_Name", "Work_Class", "Parcel", "Addr1", "Predir", "Addr2", "Addr3", "Street_Type", "Post_Dir", "Unit", "City", "State", "Zip", "lastchangedon", "expiredate"],
  fieldTypes: { Permit_Number: "esriFieldTypeString", permit_status: "esriFieldTypeString", applydate: "esriFieldTypeDate", issuedate: "esriFieldTypeDate", finalizedate: "esriFieldTypeDate", last_insp_date: "esriFieldTypeDate", permitvalue: "esriFieldTypeInteger", Permit_Type: "esriFieldTypeString", Friendly_Name: "esriFieldTypeString", Work_Class: "esriFieldTypeString", Parcel: "esriFieldTypeString", Addr1: "esriFieldTypeString", Predir: "esriFieldTypeString", Addr2: "esriFieldTypeString", Addr3: "esriFieldTypeString", Street_Type: "esriFieldTypeString", Post_Dir: "esriFieldTypeString", Unit: "esriFieldTypeString", City: "esriFieldTypeString", State: "esriFieldTypeString", Zip: "esriFieldTypeString", lastchangedon: "esriFieldTypeDate", expiredate: "esriFieldTypeDate" },
  orderBy: "lastchangedon ASC,Permit_Number ASC",
  pageSize: 500,
  coverage: "DELTA",
  buildWhere: (start, end) => timeWindow("lastchangedon", start, end),
  parse: (attributes) => {
    const row = permitSchema.parse(attributes)
    const address = [row.Addr1, row.Predir, row.Addr2, row.Addr3, row.Street_Type, row.Post_Dir, row.Unit].filter(Boolean).join(" ")
    return {
      nativeRecordKey: row.Permit_Number,
      parcelId: parcel(row.Parcel),
      siteAddress: address || undefined,
      sourceEventAt: iso(row.applydate),
      sourceUpdatedAt: iso(row.lastchangedon),
      state: { status: row.permit_status, appliedAt: iso(row.applydate) ?? null, issuedAt: iso(row.issuedate) ?? null, finalizedAt: iso(row.finalizedate) ?? null, lastInspectionAt: iso(row.last_insp_date) ?? null, changedAt: iso(row.lastchangedon) ?? null, expiresAt: iso(row.expiredate) ?? null, value: row.permitvalue, permitType: row.Permit_Type, friendlyName: row.Friendly_Name, workClass: row.Work_Class, city: row.City, state: row.State, zip: row.Zip },
    }
  },
  classify: classifyPermit,
}

export const CAPE_CORAL_PAYOFF: CapeCoralSourceDefinition = {
  sourceId: "cape_coral_open_data_payoff",
  queryUrl: "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/2/query",
  outFields: ["SVC", "STRAP", "currentamt", "payoff", "Hide", "Site_Address", "Geotype", "OBJECTID"],
  fieldTypes: { SVC: "esriFieldTypeString", STRAP: "esriFieldTypeString", currentamt: "esriFieldTypeDouble", payoff: "esriFieldTypeDouble", Hide: "esriFieldTypeString", Site_Address: "esriFieldTypeString", Geotype: "esriFieldTypeString", OBJECTID: "esriFieldTypeOID" },
  orderBy: "STRAP ASC,SVC ASC,OBJECTID ASC",
  pageSize: 2_000,
  coverage: "WATCHLIST",
  buildWhere: (_start, _end, parcelIds = []) => {
    if (parcelIds.length === 0 || parcelIds.length > 50 || parcelIds.some((id) => !parcelPattern.test(id))) throw new Error("Payoff snapshots require 1-50 validated watchlist parcels")
    return `STRAP IN (${parcelIds.map((id) => `'${id}'`).join(",")})`
  },
  parse: (attributes) => {
    const row = payoffSchema.parse(attributes)
    return { nativeRecordKey: `${row.STRAP}|${row.SVC}`, parcelId: parcel(row.STRAP), siteAddress: row.Site_Address ?? undefined, state: { serviceCategory: row.SVC, currentAmount: row.currentamt, payoffAmount: row.payoff, hidden: row.Hide, geotype: row.Geotype } }
  },
  classify: classifyPayoff,
}

function queryUrl(definition: CapeCoralSourceDefinition, where: string, offset: number): string {
  const url = new URL(definition.queryUrl)
  url.searchParams.set("where", where)
  url.searchParams.set("outFields", definition.outFields.join(","))
  url.searchParams.set("returnGeometry", "false")
  url.searchParams.set("orderByFields", definition.orderBy)
  url.searchParams.set("resultOffset", String(offset))
  url.searchParams.set("resultRecordCount", String(definition.pageSize))
  url.searchParams.set("returnExceededLimitFeatures", "true")
  url.searchParams.set("f", "json")
  return url.toString()
}

export async function collectCapeCoralSnapshot(
  definition: CapeCoralSourceDefinition,
  options: { windowStart: Date; windowEnd: Date; collectedAt?: Date; parcelIds?: readonly string[]; fetch?: FetchLike; signal?: AbortSignal },
): Promise<SnapshotCollection> {
  if (!sourcePolicyAllows(definition.sourceId, definition.queryUrl)) throw new Error(`${definition.sourceId} is not approved for production automation`)
  if (!(options.windowStart < options.windowEnd)) throw new Error("Snapshot window must have a positive duration")
  const maxRequests = sourceSnapshotRequestBudget(definition.sourceId)
  if (maxRequests < 1) throw new Error(`${definition.sourceId} has no approved snapshot request budget`)
  const fetcher = options.fetch ?? fetch
  const where = definition.buildWhere(options.windowStart, options.windowEnd, options.parcelIds)
  const records: SnapshotRecordInput[] = []
  let receivedSchema: string | undefined
  let completed = false
  let attempts = 0
  let offset = 0

  while (attempts < maxRequests) {
    attempts += 1
    try {
      const response = await fetcher(queryUrl(definition, where, offset), {
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        if (response.status === 408 || response.status === 429 || response.status >= 500) throw new RetryableSnapshotError(`${definition.sourceId} returned HTTP ${response.status}`)
        throw new Error(`${definition.sourceId} returned HTTP ${response.status}; snapshot was not committed`)
      }
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) throw new Error(`${definition.sourceId} returned non-JSON content`)
      const payload = await response.json() as ArcgisResponse
      if (payload.error) throw new Error(`${definition.sourceId} returned ArcGIS error ${payload.error.code ?? "unknown"}: ${payload.error.message ?? "unknown"}`)
      const pageSchema = assertSchema(definition, payload.fields)
      if (receivedSchema && pageSchema !== receivedSchema) throw new Error(`${definition.sourceId} schema changed between pages`)
      receivedSchema = pageSchema
      const features = payload.features
      if (!features) throw new Error(`${definition.sourceId} omitted features`)
      for (const feature of features) records.push(definition.parse(feature.attributes))
      if (!payload.exceededTransferLimit) {
        completed = true
        break
      }
      offset += definition.pageSize
    } catch (error) {
      if (options.signal?.aborted) throw error
      const retryable = error instanceof RetryableSnapshotError || error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")
      if (!retryable || attempts >= maxRequests) throw error
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, attempts * 250)))
    }
  }

  if (!completed) throw new Error(`${definition.sourceId} exceeded its approved ${maxRequests}-request snapshot budget; partial data was discarded`)
  return {
    sourceId: definition.sourceId,
    collectedAt: (options.collectedAt ?? new Date()).toISOString(),
    schemaFingerprint: receivedSchema ?? schemaFingerprint(expectedSchema(definition)),
    coverage: definition.coverage,
    windowStart: options.windowStart.toISOString(),
    windowEnd: options.windowEnd.toISOString(),
    records,
  }
}

class RetryableSnapshotError extends Error {}
