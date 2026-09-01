import { describe, expect, it } from "vitest"
import {
  CAPE_CORAL_BUILDING_PERMITS,
  CAPE_CORAL_CODE_CASES,
  CAPE_CORAL_PAYOFF,
  CAPE_CORAL_UTILITY_LIENS,
  collectCapeCoralSnapshot,
  type CapeCoralSourceDefinition,
} from "@/lib/cape-coral-events"
import { commitCollection, InMemorySnapshotStore } from "@/lib/snapshots"

const start = new Date("2026-08-31T04:00:00.000Z")
const end = new Date("2026-09-01T04:00:00.000Z")
const collectedAt = new Date("2026-09-01T05:00:00.000Z")

function response(definition: CapeCoralSourceDefinition, attributes: unknown[], exceededTransferLimit = false): Response {
  return new Response(JSON.stringify({
    fields: definition.outFields.map((name) => ({ name, type: definition.fieldTypes[name] })),
    features: attributes.map((value) => ({ attributes: value })),
    exceededTransferLimit,
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })
}

const code = (overrides: Record<string, unknown> = {}) => ({
  CMCODECASEID: "d07a6590-aa57-4739-a755-e4b72128b335",
  CaseNumber: "CODE26-020878",
  Status: "Open",
  opened: Date.parse("2026-08-31T17:42:42.000Z"),
  closed: null,
  updated: Date.parse("2026-08-31T17:43:32.640Z"),
  CaseType: "FORECLOSURE REGISTRATION",
  CaseSubtype: "REGISTERED",
  Main_Linked_Parcel: "304424C2007000560",
  STRAPGIS: "304424C2007000560",
  SiteAddressGIS: "1447 SE 17TH TER",
  ...overrides,
})

const lien = (overrides: Record<string, unknown> = {}) => ({
  Strap: "304424C2007000560",
  Date_Liened: Date.parse("2026-09-01T12:00:00.000Z"),
  Lien_Number: "UTL-26-001",
  Lien_Amount: 4830,
  Lien_Release_Date: null,
  Lien_Release_Number: null,
  Active_Lien: "Y",
  OBJECTID: 42,
  ...overrides,
})

const permit = (overrides: Record<string, unknown> = {}) => ({
  Permit_Number: "RES2026-00001",
  permit_status: "Issued",
  applydate: Date.parse("2026-08-30T12:00:00.000Z"),
  issuedate: Date.parse("2026-08-31T12:00:00.000Z"),
  finalizedate: null,
  last_insp_date: null,
  permitvalue: 25000,
  Permit_Type: "Residential",
  Friendly_Name: "Roof",
  Work_Class: "Repair",
  Parcel: "304424C2007000560",
  Addr1: "1447",
  Predir: "SE",
  Addr2: "17TH",
  Addr3: null,
  Street_Type: "TER",
  Post_Dir: null,
  Unit: null,
  City: "Cape Coral",
  State: "FL",
  Zip: "33990",
  lastchangedon: Date.parse("2026-08-31T12:01:00.000Z"),
  expiredate: null,
  ...overrides,
})

describe("Cape Coral event-stream adapters", () => {
  it("builds an end-bounded Eastern-time query and never requests private code fields", async () => {
    let requested: URL | undefined
    const collection = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, {
      windowStart: start,
      windowEnd: end,
      collectedAt,
      fetch: async (input) => {
        requested = new URL(String(input))
        return response(CAPE_CORAL_CODE_CASES, [code()])
      },
    })
    const where = requested?.searchParams.get("where") ?? ""
    expect(where).toContain("updated >= TIMESTAMP '2026-08-31 00:00:00'")
    expect(where).toContain("updated < TIMESTAMP '2026-09-01 00:00:00'")
    expect(requested?.searchParams.get("outFields")).not.toMatch(/Owner|Mailing|description|UpdatedBy/i)
    expect(collection.records[0]).toMatchObject({ parcelId: "304424C2007000560", state: { caseType: "FORECLOSURE REGISTRATION" } })
  })

  it("does not call baseline records new, then emits a defensible new foreclosure registration", async () => {
    const store = new InMemorySnapshotStore()
    const baseline = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => response(CAPE_CORAL_CODE_CASES, []) })
    expect((await commitCollection(store, baseline, CAPE_CORAL_CODE_CASES.classify)).transitions).toEqual([])
    const next = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, {
      windowStart: new Date("2026-08-31T16:00:00.000Z"),
      windowEnd: new Date("2026-09-02T04:00:00.000Z"),
      collectedAt: new Date("2026-09-02T05:00:00.000Z"),
      fetch: async () => response(CAPE_CORAL_CODE_CASES, [code()]),
    })
    const result = await commitCollection(store, next, CAPE_CORAL_CODE_CASES.classify)
    expect(result.transitions).toHaveLength(1)
    expect(result.transitions[0]).toMatchObject({ eventType: "NEW_FORECLOSURE_REGISTRATION", eventDate: "2026-08-31T17:42:42.000Z", eventClockBasis: "SOURCE_EVENT", firstSeenAt: "2026-09-02T05:00:00.000Z" })
  })

  it("never calls an old row new merely because an update window sees it for the first time", async () => {
    const store = new InMemorySnapshotStore()
    const baseline = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => response(CAPE_CORAL_CODE_CASES, []) })
    await commitCollection(store, baseline, CAPE_CORAL_CODE_CASES.classify)
    const lateOldRow = code({ opened: Date.parse("2022-05-01T12:00:00.000Z"), updated: Date.parse("2026-09-01T18:00:00.000Z") })
    const next = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, { windowStart: new Date("2026-08-31T16:00:00.000Z"), windowEnd: new Date("2026-09-02T04:00:00.000Z"), collectedAt: new Date("2026-09-02T05:00:00.000Z"), fetch: async () => response(CAPE_CORAL_CODE_CASES, [lateOldRow]) })
    expect((await commitCollection(store, next, CAPE_CORAL_CODE_CASES.classify)).transitions[0]).toMatchObject({ eventType: "CODE_CASE_UPDATED", eventDate: "2026-09-01T18:00:00.000Z", eventClockBasis: "SOURCE_UPDATE" })
  })

  it("emits source-dated lien creation and release transitions without inferring title facts", async () => {
    const store = new InMemorySnapshotStore()
    const baseline = await collectCapeCoralSnapshot(CAPE_CORAL_UTILITY_LIENS, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => response(CAPE_CORAL_UTILITY_LIENS, []) })
    await commitCollection(store, baseline, CAPE_CORAL_UTILITY_LIENS.classify)
    const created = await collectCapeCoralSnapshot(CAPE_CORAL_UTILITY_LIENS, { windowStart: start, windowEnd: new Date("2026-09-02T04:00:00.000Z"), collectedAt: new Date("2026-09-02T05:00:00.000Z"), fetch: async () => response(CAPE_CORAL_UTILITY_LIENS, [lien()]) })
    expect((await commitCollection(store, created, CAPE_CORAL_UTILITY_LIENS.classify)).transitions[0].eventType).toBe("NEW_UTILITY_LIEN")
    const releasedAt = Date.parse("2026-09-02T15:00:00.000Z")
    const released = await collectCapeCoralSnapshot(CAPE_CORAL_UTILITY_LIENS, { windowStart: new Date("2026-09-01T04:00:00.000Z"), windowEnd: new Date("2026-09-03T04:00:00.000Z"), collectedAt: new Date("2026-09-03T05:00:00.000Z"), fetch: async () => response(CAPE_CORAL_UTILITY_LIENS, [lien({ Lien_Release_Date: releasedAt, Lien_Release_Number: "REL-1", Active_Lien: "N" })]) })
    const result = await commitCollection(store, released, CAPE_CORAL_UTILITY_LIENS.classify)
    expect(result.transitions.map((item) => item.eventType)).toEqual(["LIEN_RELEASED"])
    expect(result.transitions[0].eventDate).toBe("2026-09-02T15:00:00.000Z")
    expect(result.transitions[0].eventClockBasis).toBe("SOURCE_EVENT")
  })

  it("classifies permit finalization from a source update", async () => {
    const store = new InMemorySnapshotStore()
    const baseline = await collectCapeCoralSnapshot(CAPE_CORAL_BUILDING_PERMITS, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => response(CAPE_CORAL_BUILDING_PERMITS, [permit()]) })
    await commitCollection(store, baseline, CAPE_CORAL_BUILDING_PERMITS.classify)
    const finalizedAt = Date.parse("2026-09-01T18:00:00.000Z")
    const updated = await collectCapeCoralSnapshot(CAPE_CORAL_BUILDING_PERMITS, { windowStart: new Date("2026-08-31T16:00:00.000Z"), windowEnd: new Date("2026-09-02T04:00:00.000Z"), collectedAt: new Date("2026-09-02T05:00:00.000Z"), fetch: async () => response(CAPE_CORAL_BUILDING_PERMITS, [permit({ permit_status: "Finaled", finalizedate: finalizedAt, lastchangedon: finalizedAt })]) })
    expect((await commitCollection(store, updated, CAPE_CORAL_BUILDING_PERMITS.classify)).transitions[0]).toMatchObject({ eventType: "PERMIT_FINALIZED", eventDate: "2026-09-01T18:00:00.000Z" })
  })

  it("classifies a previously unseen old permit as updated, not opened", async () => {
    const store = new InMemorySnapshotStore()
    await commitCollection(store, await collectCapeCoralSnapshot(CAPE_CORAL_BUILDING_PERMITS, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => response(CAPE_CORAL_BUILDING_PERMITS, []) }), CAPE_CORAL_BUILDING_PERMITS.classify)
    const changedAt = Date.parse("2026-09-01T18:00:00.000Z")
    const oldPermit = permit({ applydate: Date.parse("2022-05-01T12:00:00.000Z"), lastchangedon: changedAt })
    const next = await collectCapeCoralSnapshot(CAPE_CORAL_BUILDING_PERMITS, { windowStart: new Date("2026-08-31T16:00:00.000Z"), windowEnd: new Date("2026-09-02T04:00:00.000Z"), collectedAt: new Date("2026-09-02T05:00:00.000Z"), fetch: async () => response(CAPE_CORAL_BUILDING_PERMITS, [oldPermit]) })
    expect((await commitCollection(store, next, CAPE_CORAL_BUILDING_PERMITS.classify)).transitions[0]).toMatchObject({ eventType: "PERMIT_UPDATED", eventClockBasis: "SOURCE_UPDATE" })
  })

  it("does not call a value-only permit correction a status change", async () => {
    const store = new InMemorySnapshotStore()
    await commitCollection(store, await collectCapeCoralSnapshot(CAPE_CORAL_BUILDING_PERMITS, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => response(CAPE_CORAL_BUILDING_PERMITS, [permit()]) }), CAPE_CORAL_BUILDING_PERMITS.classify)
    const changedAt = Date.parse("2026-09-01T18:00:00.000Z")
    const next = await collectCapeCoralSnapshot(CAPE_CORAL_BUILDING_PERMITS, { windowStart: new Date("2026-08-31T16:00:00.000Z"), windowEnd: new Date("2026-09-02T04:00:00.000Z"), collectedAt: new Date("2026-09-02T05:00:00.000Z"), fetch: async () => response(CAPE_CORAL_BUILDING_PERMITS, [permit({ permitvalue: 30000, lastchangedon: changedAt })]) })
    expect((await commitCollection(store, next, CAPE_CORAL_BUILDING_PERMITS.classify)).transitions[0].eventType).toBe("PERMIT_UPDATED")
  })

  it("keeps payoff snapshots watchlist-only and rejects private NAME leakage", async () => {
    let requested: URL | undefined
    const attributes = { SVC: "Munis", STRAP: "304424C2007000560", currentamt: 790.14, payoff: 790.14, Hide: null, Site_Address: "1447 SE 17TH TER", Geotype: "Parcel", OBJECTID: 12 }
    const result = await collectCapeCoralSnapshot(CAPE_CORAL_PAYOFF, { windowStart: start, windowEnd: end, collectedAt, parcelIds: ["304424C2007000560"], fetch: async (input) => { requested = new URL(String(input)); return response(CAPE_CORAL_PAYOFF, [attributes]) } })
    expect(result.coverage).toBe("WATCHLIST")
    expect(requested?.searchParams.get("outFields")).not.toContain("NAME")
    expect(() => CAPE_CORAL_PAYOFF.parse({ ...attributes, NAME: "PRIVATE OWNER" })).toThrow()
  })

  it("discards partial pagination and schema drift instead of committing either", async () => {
    let calls = 0
    await expect(collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, {
      windowStart: start,
      windowEnd: end,
      collectedAt,
      fetch: async () => { calls += 1; return response(CAPE_CORAL_CODE_CASES, [code({ CMCODECASEID: `case-${calls}` })], true) },
    })).rejects.toThrow(/partial data was discarded/i)
    expect(calls).toBe(4)

    const drift = new Response(JSON.stringify({ fields: [{ name: "CMCODECASEID", type: "esriFieldTypeString" }], features: [] }), { status: 200, headers: { "content-type": "application/json" } })
    await expect(collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, { windowStart: start, windowEnd: end, collectedAt, fetch: async () => drift })).rejects.toThrow(/schema changed/i)
  })

  it("retries only transient failures within the same physical-request budget", async () => {
    let calls = 0
    const result = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, {
      windowStart: start,
      windowEnd: end,
      collectedAt,
      fetch: async () => {
        calls += 1
        return calls === 1 ? new Response("temporarily unavailable", { status: 503 }) : response(CAPE_CORAL_CODE_CASES, [])
      },
    })
    expect(calls).toBe(2)
    expect(result.records).toEqual([])
  })
})
