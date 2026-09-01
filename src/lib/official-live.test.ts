import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { assembleOfficialGraph, createSourceRequestConsumer, NAL_PARSER_PROGRAM, runOfficialLiveInvestigation, type DorPropertyRecord } from "@/lib/official-live"

const dor: DorPropertyRecord = {
  countyNumber: "46",
  parcelId: "174423C3039260170",
  assessmentYear: 2026,
  justValue: 238922,
  assessedSchool: 98677,
  assessedNonSchool: 98677,
  taxableSchool: 0,
  taxableNonSchool: 0,
  landValue: 55718,
  landSquareFeet: 10019,
  actualYearBuilt: 2005,
  livingAreaSquareFeet: 2545,
  buildingCount: 1,
  landUseCode: "001",
  siteAddress: "413 SW 26TH AVE",
  siteCity: "CAPE CORAL",
  siteZip: "33991",
  legalDescription: "CAPE CORAL UNIT 54",
  stateParcelId: "C46-000-479-8015-6",
  archiveSha256: "a".repeat(64),
  schemaSha256: "b".repeat(64),
}

const city = {
  Strap: "174423C3039260170             ",
  Date_Liened: 1645765200000,
  Lien_Number: "2022000068029       ",
  Lien_Amount: 12314.43,
  Lien_Release_Date: null,
  Active_Lien: "Y" as const,
  OBJECTID: 1665843 as const,
}

describe("official live property graph", () => {
  it("promotes an exact City STRAP to DOR parcel join with same-run evidence", () => {
    const graph = assembleOfficialGraph(dor, city, "2026-09-01T16:00:00.000Z")
    expect(graph.property.countyParcelId).toBe(dor.parcelId)
    expect(graph.events).toHaveLength(1)
    expect(graph.events[0]).toMatchObject({ eventType: "LIEN_STATUS_ACTIVE", match: "EXACT", confidence: "HIGH" })
    expect(graph.events.some((event) => event.eventType === "NEW_LIEN")).toBe(false)
    expect(graph.events[0].evidenceIds).toHaveLength(2)
    expect(graph.events[0].evidenceIds.every((id) => graph.evidence.some((evidence) => evidence.evidenceId === id))).toBe(true)
  })

  it("retains no owner, customer, account, or contact fields", () => {
    const graph = assembleOfficialGraph(dor, city, "2026-09-01T16:00:00.000Z")
    expect(graph.owners).toEqual([])
    const rawFieldNames = graph.evidence.flatMap((item) => Object.keys(item.rawValue as Record<string, unknown>))
    expect(rawFieldNames.join(" ")).not.toMatch(/owner|customer|account|phone|email|mailing/i)
  })

  it("fails closed when the municipal STRAP and state parcel ID differ", () => {
    expect(() => assembleOfficialGraph(dor, { ...city, Strap: "314424C2006420410" }, "2026-09-01T16:00:00.000Z")).toThrow(/exactly match/i)
  })

  const headers = ["CO_NO", "PARCEL_ID", "ASMNT_YR", "JV", "AV_SD", "AV_NSD", "TV_SD", "TV_NSD", "LND_VAL", "LND_SQFOOT", "ACT_YR_BLT", "TOT_LVG_AREA", "NO_BULDNG", "DOR_UC", "PHY_ADDR1", "PHY_CITY", "PHY_ZIPCD", "S_LEGAL", "STATE_PAR_ID"]
  const values = ["46", dor.parcelId, "2026", "238922", "98677", "98677", "0", "0", "55718", "10019", "2005", "2545", "1", "001", "413 SW 26TH AVE", "CAPE CORAL", "33991", "CAPE CORAL\nUNIT 54", "C46-000-479-8015-6"]
  const csvRow = (row: string[]) => row.map((value) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(",")
  const runParser = (contents: string) => {
    const directory = mkdtempSync(join(tmpdir(), "acrebrief-nal-"))
    const file = join(directory, "roll.csv")
    try {
      writeFileSync(file, contents)
      const result = spawnSync("python3", ["-c", NAL_PARSER_PROGRAM, file, dor.parcelId, "a".repeat(64)], { encoding: "utf8", timeout: 5_000 })
      if (result.status !== 0) throw new Error("DOR parser rejected fixture")
      return result.stdout.trim()
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }

  it("parses one exact RFC-4180 parcel row, including a quoted newline", () => {
    const parsed = JSON.parse(runParser(`${csvRow(headers)}\n${csvRow(values)}\n`)) as DorPropertyRecord
    expect(parsed).toMatchObject({ parcelId: dor.parcelId, legalDescription: "CAPE CORAL\nUNIT 54" })
    expect(parsed.schemaSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it("rejects missing or duplicate DOR headers before emitting facts", () => {
    expect(() => runParser(`${csvRow(headers.slice(1))}\n${csvRow(values.slice(1))}\n`)).toThrow()
    expect(() => runParser(`${csvRow([...headers, "PARCEL_ID"])}\n${csvRow([...values, dor.parcelId])}\n`)).toThrow()
  })

  it("rejects duplicate exact parcel rows", () => {
    expect(() => runParser(`${csvRow(headers)}\n${csvRow(values)}\n${csvRow(values)}\n`)).toThrow()
  })

  it("honors an already-cancelled request before launching remote work", async () => {
    const previous = process.env.SOLARI_API_KEY
    process.env.SOLARI_API_KEY = "configured-for-cancellation-test"
    const controller = new AbortController()
    controller.abort(new Error("test cancellation"))
    try {
      const generator = runOfficialLiveInvestigation({ mode: "live", caseNumber: "CAPE-CORAL-UTILITY-LIEN", propertyAddress: "413 SW 26th Ave, Cape Coral, FL 33991" }, controller.signal)
      expect((await generator.next()).value).toMatchObject({ stage: "failed", message: expect.stringMatching(/failed safely/i) })
    } finally {
      if (previous) process.env.SOLARI_API_KEY = previous
      else delete process.env.SOLARI_API_KEY
    }
  })

  it("enforces the generated policy across every physical retry attempt", () => {
    const consume = createSourceRequestConsumer()
    for (let attempt = 0; attempt < 4; attempt += 1) consume("florida_dor_property_tax_data")
    expect(() => consume("florida_dor_property_tax_data")).toThrow(/physical-request budget/i)
    consume("cape_coral_open_data_utility_liens")
    consume("cape_coral_open_data_utility_liens")
    expect(() => consume("cape_coral_open_data_utility_liens")).toThrow(/physical-request budget/i)
  })
})
