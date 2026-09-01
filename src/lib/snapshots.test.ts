import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { commitCollection, InMemorySnapshotStore, reconcileSnapshot, type SnapshotCollection, type StoredSnapshotRecord, type TransitionClassifier } from "@/lib/snapshots"

const schemaFingerprint = createHash("sha256").update("fixture-schema").digest("hex")
const record = (status: string, amount = 100) => ({ nativeRecordKey: "case-1", parcelId: "304424C2007000560", sourceEventAt: "2026-09-01T10:00:00.000Z", sourceUpdatedAt: "2026-09-01T10:00:00.000Z", state: { status, amount } })
const collection = (start: string, end: string, records = [record("Open")]): SnapshotCollection => ({ sourceId: "test-source", collectedAt: end, schemaFingerprint, coverage: "DELTA", windowStart: start, windowEnd: end, records })
const classifier: TransitionClassifier = (previous: StoredSnapshotRecord | undefined, current, context) => {
  if (!previous) return [{ eventType: "CODE_VIOLATION_OPENED", eventDate: current.sourceEventAt ?? context.collectedAt, eventClockBasis: current.sourceEventAt ? "SOURCE_EVENT" : "ACREBRIEF_DETECTION" }]
  if (previous.state.status !== current.state.status && current.state.status === "Closed") return [{ eventType: "CODE_CASE_CLOSED", eventDate: current.sourceUpdatedAt ?? context.collectedAt, eventClockBasis: current.sourceUpdatedAt ? "SOURCE_UPDATE" : "ACREBRIEF_DETECTION" }]
  if (previous.state.amount !== current.state.amount) return [{ eventType: "LIEN_AMOUNT_CHANGED", eventDate: context.collectedAt, eventClockBasis: "ACREBRIEF_DETECTION" }]
  return [{ eventType: "CODE_CASE_UPDATED", eventDate: current.sourceUpdatedAt ?? context.collectedAt, eventClockBasis: current.sourceUpdatedAt ? "SOURCE_UPDATE" : "ACREBRIEF_DETECTION" }]
}

describe("durable snapshot reconciliation", () => {
  it("bootstraps without claiming existing rows are new", async () => {
    const store = new InMemorySnapshotStore()
    const result = await commitCollection(store, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    expect(result.bootstrap).toBe(true)
    expect(result.transitions).toEqual([])
    expect((await store.load("test-source"))?.records[0].firstSeenAt).toBe("2026-09-02T00:00:00.000Z")
  })

  it("emits no transition for an identical second observation", async () => {
    const store = new InMemorySnapshotStore()
    await commitCollection(store, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    const result = await commitCollection(store, collection("2026-09-02T00:00:00.000Z", "2026-09-03T00:00:00.000Z"), classifier)
    expect(result.unchanged).toBe(1)
    expect(result.transitions).toEqual([])
  })

  it("emits one idempotent field-aware closure transition", async () => {
    const store = new InMemorySnapshotStore()
    await commitCollection(store, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    const closed = { ...record("Closed"), sourceUpdatedAt: "2026-09-02T12:00:00.000Z" }
    const result = await commitCollection(store, collection("2026-09-02T00:00:00.000Z", "2026-09-03T00:00:00.000Z", [closed]), classifier)
    expect(result.transitions).toHaveLength(1)
    expect(result.transitions[0]).toMatchObject({ eventType: "CODE_CASE_CLOSED", before: { status: "Open", amount: 100 }, after: { status: "Closed", amount: 100 } })
    expect(store.transitions).toHaveLength(1)
  })

  it("preserves repeated state edges as distinct source-dated events", async () => {
    const store = new InMemorySnapshotStore()
    await commitCollection(store, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    const closedFirst = { ...record("Closed"), sourceUpdatedAt: "2026-09-02T12:00:00.000Z" }
    const openAgain = { ...record("Open"), sourceUpdatedAt: "2026-09-03T12:00:00.000Z" }
    const closedAgain = { ...record("Closed"), sourceUpdatedAt: "2026-09-04T12:00:00.000Z" }
    const first = await commitCollection(store, collection("2026-09-02T00:00:00.000Z", "2026-09-03T00:00:00.000Z", [closedFirst]), classifier)
    await commitCollection(store, collection("2026-09-03T00:00:00.000Z", "2026-09-04T00:00:00.000Z", [openAgain]), classifier)
    const repeated = await commitCollection(store, collection("2026-09-04T00:00:00.000Z", "2026-09-05T00:00:00.000Z", [closedAgain]), classifier)
    expect(first.transitions[0]?.eventType).toBe("CODE_CASE_CLOSED")
    expect(repeated.transitions[0]?.eventType).toBe("CODE_CASE_CLOSED")
    expect(repeated.transitions[0]?.transitionId).not.toBe(first.transitions[0]?.transitionId)
    expect(store.transitions).toHaveLength(3)
  })

  it("preserves prior rows omitted from a delta window and never infers deletion", async () => {
    const first = reconcileSnapshot(null, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    const second = reconcileSnapshot(first.next, collection("2026-09-02T00:00:00.000Z", "2026-09-03T00:00:00.000Z", []), classifier)
    expect(second.transitions).toEqual([])
    expect(second.next.records).toHaveLength(1)
  })

  it("allows a bounded lookback but rejects stale watermarks, duplicate native keys, and malformed parcel identifiers", () => {
    const first = reconcileSnapshot(null, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    expect(() => reconcileSnapshot(first.next, collection("2026-09-01T12:00:00.000Z", "2026-09-03T00:00:00.000Z"), classifier)).not.toThrow()
    expect(() => reconcileSnapshot(first.next, collection("2026-08-31T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)).toThrow(/watermark/i)
    expect(() => reconcileSnapshot(null, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z", [record("Open"), record("Closed")] ), classifier)).toThrow(/duplicate native key/i)
    expect(() => reconcileSnapshot(null, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z", [{ ...record("Open"), parcelId: "bad" }]), classifier)).toThrow(/parcel identifier/i)
  })

  it("fails a stale concurrent writer without mutating committed state", async () => {
    const store = new InMemorySnapshotStore()
    const first = reconcileSnapshot(null, collection("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"), classifier)
    await store.commit("test-source", 0, first.next, [])
    await expect(store.commit("test-source", 0, { ...first.next, generation: 2 }, [])).rejects.toThrow(/generation conflict/i)
    expect((await store.load("test-source"))?.generation).toBe(1)
  })
})
