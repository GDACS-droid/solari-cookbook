import { describe, expect, it } from "vitest"
import { assembleLiveGraph, assertApprovedNavigation, investigationInput } from "@/lib/investigation"
import type { Evidence } from "@/lib/acrebrief"

const liveEvidence = (sourceId: string, evidenceId: string, confidence: Evidence["confidence"] = "HIGH"): Evidence => ({
  evidenceId,
  sourceId,
  sourceUrl: `https://example.test/${sourceId}`,
  retrievedAt: "2026-09-01T12:00:00.000Z",
  rawValue: { markerMatches: true },
  normalizedValue: { allMarkersMatched: true },
  confidence,
  adapterVersion: "test",
})

describe("live investigation graph assembly", () => {
  it("rebinds every live event to evidence captured in the current run", () => {
    const evidence = [
      liveEvidence("lee-business-observer-notice-of-action", "live-notice"),
      liveEvidence("lee-business-observer-foreclosure-sale", "live-sale"),
    ]
    const graph = assembleLiveGraph(investigationInput.parse({}), evidence, new Set(evidence.map((item) => item.sourceId)))
    const evidenceIds = new Set(graph.evidence.map((item) => item.evidenceId))

    expect(graph.events).toHaveLength(2)
    expect(graph.events.find((event) => event.eventType === "FORECLOSURE_NOTICE_PUBLISHED")?.evidenceIds).toEqual(["live-notice"])
    expect(graph.events.find((event) => event.eventType === "FORECLOSURE_SALE_NOTICE_PUBLISHED")?.evidenceIds).toEqual(["live-sale"])
    expect(graph.events.flatMap((event) => event.evidenceIds).every((id) => evidenceIds.has(id))).toBe(true)
  })

  it("does not promote an event without high-confidence evidence from this run", () => {
    const evidence = [liveEvidence("lee-business-observer-notice-of-action", "incomplete", "LOW")]
    const graph = assembleLiveGraph(investigationInput.parse({}), evidence, new Set(["lee-business-observer-notice-of-action"]))

    expect(graph.events).toEqual([])
    expect(graph.courtCases).toEqual([])
  })

  it("rejects a redirect to a different origin or path", () => {
    expect(() => assertApprovedNavigation("https://example.test/approved", "https://other.test/approved")).toThrow(/redirected/i)
    expect(() => assertApprovedNavigation("https://example.test/approved", "https://example.test/other")).toThrow(/redirected/i)
    expect(() => assertApprovedNavigation("https://example.test/approved", "https://example.test/approved?session=1")).not.toThrow()
  })
})
