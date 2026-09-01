import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CAPE_CORAL_CODE_CASES, CAPE_CORAL_PAYOFF, collectCapeCoralSnapshot } from "@/lib/cape-coral-events"
import { JsonFileSnapshotStore } from "@/lib/snapshot-file-store"
import { runCapeCoralEventStream } from "@/lib/snapshot-runner"

const live = process.env.RUN_LIVE_SOURCE_TESTS === "1"

describe.skipIf(!live)("Cape Coral official Open Data live contract", () => {
  it("retrieves a privacy-minimized code-event window through the production adapter", async () => {
    const result = await collectCapeCoralSnapshot(CAPE_CORAL_CODE_CASES, {
      windowStart: new Date("2026-08-31T04:00:00.000Z"),
      windowEnd: new Date("2026-09-01T04:00:00.000Z"),
      collectedAt: new Date("2026-09-01T05:00:00.000Z"),
    })
    expect(result.records.some((record) => record.nativeRecordKey === "d07a6590-aa57-4739-a755-e4b72128b335")).toBe(true)
    expect(JSON.stringify(result.records)).not.toMatch(/OwnerGIS|Mailing|case_description|UpdatedBy/)
  }, 30_000)

  it("retrieves watchlist payoff state without requesting the source NAME field", async () => {
    const result = await collectCapeCoralSnapshot(CAPE_CORAL_PAYOFF, {
      windowStart: new Date("2026-08-31T04:00:00.000Z"),
      windowEnd: new Date("2026-09-01T04:00:00.000Z"),
      collectedAt: new Date("2026-09-01T05:00:00.000Z"),
      parcelIds: ["304424C2007000560"],
    })
    expect(result.records).toHaveLength(1)
    expect(result.records[0].state).toMatchObject({ serviceCategory: "Munis", currentAmount: 790.14, payoffAmount: 790.14 })
    expect(JSON.stringify(result.records)).not.toContain("NAME")
  }, 30_000)

  it("establishes a durable three-source baseline without fabricating NEW events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acrebrief-live-baseline-"))
    const file = join(directory, "snapshots.json")
    const run = await runCapeCoralEventStream({
      store: new JsonFileSnapshotStore(file),
      now: new Date("2026-09-01T04:00:00.000Z"),
      bootstrapHours: 24,
    })
    if (run.status !== "SUCCEEDED") throw new Error(`Live baseline failed: ${JSON.stringify(run.sources.map(({ sourceId, status, error }) => ({ sourceId, status, error })))}`)
    expect(run.sources).toHaveLength(3)
    expect(run.sources.every((source) => source.bootstrap && source.status === "SUCCEEDED")).toBe(true)
    expect(run.transitions).toEqual([])
    const reloaded = new JsonFileSnapshotStore(file)
    expect((await reloaded.load("cape_coral_open_data_code_cases"))?.generation).toBe(1)
    expect((await reloaded.load("cape_coral_open_data_utility_liens"))?.generation).toBe(1)
    expect((await reloaded.load("cape_coral_open_data_building_permits"))?.generation).toBe(1)
  }, 60_000)
})
