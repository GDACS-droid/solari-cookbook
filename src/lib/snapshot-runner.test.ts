import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CAPE_CORAL_CODE_CASES, CAPE_CORAL_UTILITY_LIENS, type CapeCoralSourceDefinition } from "@/lib/cape-coral-events"
import { JsonFileSnapshotStore } from "@/lib/snapshot-file-store"
import { runCapeCoralEventStream } from "@/lib/snapshot-runner"

function response(definition: CapeCoralSourceDefinition, attributes: unknown[] = []): Response {
  return new Response(JSON.stringify({ fields: definition.outFields.map((name) => ({ name, type: definition.fieldTypes[name] })), features: attributes, exceededTransferLimit: false }), { status: 200, headers: { "content-type": "application/json" } })
}

describe("Cape Coral operational snapshot runner", () => {
  it("commits healthy sources and leaves a failed source without a watermark", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acrebrief-snapshots-"))
    const file = join(directory, "state.json")
    const store = new JsonFileSnapshotStore(file)
    const run = await runCapeCoralEventStream({
      store,
      now: new Date("2026-09-01T20:00:00.000Z"),
      definitions: [CAPE_CORAL_CODE_CASES, CAPE_CORAL_UTILITY_LIENS],
      fetch: async (input) => String(input).includes("MapServer/6/") ? new Response("unavailable", { status: 503 }) : response(CAPE_CORAL_CODE_CASES),
    })
    expect(run.status).toBe("PARTIAL")
    expect(run.sources.map((source) => [source.sourceId, source.status])).toEqual([
      ["cape_coral_open_data_code_cases", "SUCCEEDED"],
      ["cape_coral_open_data_utility_liens", "FAILED"],
    ])
    expect(await store.load("cape_coral_open_data_code_cases")).not.toBeNull()
    expect(await store.load("cape_coral_open_data_utility_liens")).toBeNull()
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1)
  })

  it("fails concurrent stale file-store writers instead of overwriting state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acrebrief-snapshots-"))
    const store = new JsonFileSnapshotStore(join(directory, "state.json"))
    const now = new Date("2026-09-01T20:00:00.000Z")
    const run = await runCapeCoralEventStream({ store, now, definitions: [CAPE_CORAL_CODE_CASES], fetch: async () => response(CAPE_CORAL_CODE_CASES) })
    expect(run.status).toBe("SUCCEEDED")
    const snapshot = await store.load(CAPE_CORAL_CODE_CASES.sourceId)
    await expect(store.commit(CAPE_CORAL_CODE_CASES.sourceId, 0, { ...snapshot!, generation: 2 }, [])).rejects.toThrow(/generation conflict/i)
    expect((await store.load(CAPE_CORAL_CODE_CASES.sourceId))?.generation).toBe(1)
  })

  it("recovers a dead-process lock and deduplicates repeated transition IDs in one commit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acrebrief-snapshots-"))
    const file = join(directory, "state.json")
    await writeFile(`${file}.lock`, JSON.stringify({ token: "stale-token", pid: process.pid, processStart: `${process.pid}:reused-process`, acquiredAt: "2026-09-01T00:00:00.000Z" }))
    const store = new JsonFileSnapshotStore(file)
    const run = await runCapeCoralEventStream({ store, now: new Date("2026-09-01T20:00:00.000Z"), definitions: [CAPE_CORAL_CODE_CASES], fetch: async () => response(CAPE_CORAL_CODE_CASES) })
    expect(run.status).toBe("SUCCEEDED")
    const snapshot = (await store.load(CAPE_CORAL_CODE_CASES.sourceId))!
    const transition = {
      transitionId: "transition_duplicate_fixture",
      sourceId: CAPE_CORAL_CODE_CASES.sourceId,
      nativeRecordKey: "case-1",
      parcelId: "304424C2007000560",
      eventType: "CODE_CASE_UPDATED" as const,
      eventDate: "2026-09-01T20:00:00.000Z",
      eventClockBasis: "SOURCE_UPDATE" as const,
      firstSeenAt: "2026-09-01T20:00:00.000Z",
      afterFingerprint: "a".repeat(64),
      after: { status: "Open" },
    }
    await store.commit(CAPE_CORAL_CODE_CASES.sourceId, 1, { ...snapshot, generation: 2 }, [transition, transition])
    expect(await store.readTransitions()).toHaveLength(1)
  })

  it("recovers an old ownerless lock after its publication grace period", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acrebrief-snapshots-"))
    const file = join(directory, "state.json")
    const lock = `${file}.lock`
    await writeFile(lock, "")
    const old = new Date(Date.now() - 31_000)
    await utimes(lock, old, old)
    const store = new JsonFileSnapshotStore(file)
    const run = await runCapeCoralEventStream({ store, now: new Date("2026-09-01T20:00:00.000Z"), definitions: [CAPE_CORAL_CODE_CASES], fetch: async () => response(CAPE_CORAL_CODE_CASES) })
    expect(run.status).toBe("SUCCEEDED")
  })

  it("recovers a legacy lock record that predates token and process-start fencing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acrebrief-snapshots-"))
    const file = join(directory, "state.json")
    await writeFile(`${file}.lock`, JSON.stringify({ pid: process.pid, acquiredAt: "2026-09-01T00:00:00.000Z" }))
    const store = new JsonFileSnapshotStore(file)
    const run = await runCapeCoralEventStream({ store, now: new Date("2026-09-01T20:00:00.000Z"), definitions: [CAPE_CORAL_CODE_CASES], fetch: async () => response(CAPE_CORAL_CODE_CASES) })
    expect(run.status).toBe("SUCCEEDED")
  })
})
