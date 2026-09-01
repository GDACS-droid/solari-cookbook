import { describe, expect, it } from "vitest"
import { diffEvents, fingerprintEvent, normalizeAddress, normalizeEntityName, resolveParcel, runAdapter, scoreOpportunity, stableId, type PropertyEvent, type SourceAdapter } from "@/lib/acrebrief"
import { verifiedSampleGraph } from "@/lib/verified-sample"

describe("AcreBrief domain invariants", () => {
  it("creates stable ids and normalized address/entity crosswalks", () => {
    expect(stableId("parcel", "LEE", "123")).toBe(stableId("parcel", "LEE", "123"))
    expect(normalizeAddress("3302 East 3rd Street, Lehigh Acres, FL 33936")).toBe("3302 E 3RD ST LEHIGH ACRES FL 33936")
    expect(normalizeEntityName("Acme Holdings, L.L.C.")).toBe("ACME HOLDINGS")
  })

  it("never upgrades a fuzzy parcel match to exact", () => {
    const known = [verifiedSampleGraph.property]
    expect(resolveParcel({ county: "LEE", siteAddress: "1447 SE 17th Ter, Cape Coral, FL 33990" }, known).kind).toBe("CANDIDATE")
    expect(resolveParcel({ county: "LEE", siteAddress: "1447 17th Ter" }, known).kind).toBe("CANDIDATE")
  })

  it("emits only snapshot changes and treats duplicate filings idempotently", () => {
    const event = verifiedSampleGraph.events[0]
    const duplicate: PropertyEvent = { ...event, eventId: "another-id" }
    expect(diffEvents([event], [duplicate]).added).toHaveLength(0)
    expect(fingerprintEvent(event)).toBe(event.rawFingerprint)
  })

  it("does not collapse distinct unresolved same-day source records", () => {
    const first = { ...verifiedSampleGraph.events[0], propertyId: undefined, candidatePropertyId: undefined, sourceRecordId: "native-1" }
    const second = { ...first, eventId: "second", sourceRecordId: "native-2" }
    first.rawFingerprint = fingerprintEvent(first)
    second.rawFingerprint = fingerprintEvent(second)
    expect(first.rawFingerprint).not.toBe(second.rawFingerprint)
    expect(diffEvents([], [first, second]).added).toHaveLength(2)
  })

  it("scores known event signals and names unknown financial facts", () => {
    const score = scoreOpportunity(verifiedSampleGraph, new Date("2026-09-01T12:00:00.000Z"))
    expect(score.score).toBe(32)
    expect(score.reasons).toContainEqual(expect.objectContaining({ label: "Vacant-property foreclosure registration signal" }))
    expect(score.unknown.join(" ")).toMatch(/mortgage payoff/i)
    expect(score.disclaimer).toMatch(/Decision support/i)
  })

  it("never promotes an active status observation into a fresh-event bonus", () => {
    const observedToday = {
      ...verifiedSampleGraph,
      events: verifiedSampleGraph.events.map((event) => ({ ...event, eventType: "LIEN_STATUS_ACTIVE" as const, eventDate: "2026-09-01" })),
    }
    const score = scoreOpportunity(observedToday, new Date("2026-09-01T12:00:00.000Z"))
    expect(score.score).toBe(10)
    expect(score.reasons.some((reason) => reason.label.startsWith("New "))).toBe(false)
  })

  it("does not score a future effective date as a fresh event", () => {
    const futureGraph = {
      ...verifiedSampleGraph,
      events: verifiedSampleGraph.events.map((event, index) => index === 0 ? { ...event, eventDate: "2026-09-17" } : event),
    }
    const score = scoreOpportunity(futureGraph, new Date("2026-09-01T12:00:00.000Z"))
    expect(score.reasons.filter((reason) => reason.sourceEventId === futureGraph.events[0].eventId && reason.label.startsWith("New "))).toHaveLength(0)
  })

  it("isolates a failed source after bounded retries", async () => {
    const adapter: SourceAdapter<string> = {
      sourceId: "test-court", allowedOrigins: ["https://example.test"],
      healthcheck: async () => ({ ok: false }),
      discover: async () => [], fetch: async () => "", normalize: async () => [], resolve: async (event) => event, evidence: async () => [],
    }
    const result = await runAdapter(adapter, new Date(), new Date(), [], 2)
    expect(result.events).toEqual([])
    expect(result.metrics).toMatchObject({ status: "FAILED", attempts: 2, sourceId: "test-court" })
  })
})
