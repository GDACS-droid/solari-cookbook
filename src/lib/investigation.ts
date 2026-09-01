import { z } from "zod"
import { createHash } from "node:crypto"
import { scoreOpportunity, type Evidence, type OpportunityScore, type PropertyGraph } from "@/lib/acrebrief"
import { verifiedSampleGraph, verifiedSampleScore } from "@/lib/verified-sample"

export const investigationInput = z.object({
  mode: z.enum(["live", "verified_sample"]).default("verified_sample"),
  // The initial permitted demo is narrow on purpose: request data never controls a URL.
  caseNumber: z.literal("26-CA-001793").default("26-CA-001793"),
  propertyAddress: z.literal("3302 E 3rd St, Lehigh Acres, FL 33936").default("3302 E 3rd St, Lehigh Acres, FL 33936"),
}).strict()
export type InvestigationInput = z.infer<typeof investigationInput>
export type InvestigationStage = "queued" | "source" | "normalizing" | "complete" | "configuration_required" | "failed"
export interface InvestigationUpdate {
  stage: InvestigationStage
  at: string
  message: string
  sourceId?: string
  status?: "pending" | "running" | "complete" | "failed"
  graph?: PropertyGraph
  score?: OpportunityScore
  sessionId?: string
  replayStatus?: "recording_requested" | "available_later"
  sandboxId?: string
  clearlyLabeledReplay?: boolean
}

export const PERMITTED_LIVE_SOURCES = [
  { sourceId: "lee-clerk-matrix", url: "https://matrix.leeclerk.org/home/index" },
  { sourceId: "lee-property-appraiser", url: "https://www.leepa.org/Search/PropertySearch.aspx" },
  { sourceId: "lee-tax-collector", url: "https://leetc.com/property-taxes/" },
] as const

const PROPERTY_EVIDENCE_SOURCES = [
  {
    sourceId: "lee-business-observer-notice-of-action",
    url: "https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/",
    markers: ["26-CA-001793", "3302 E 3RD ST, LEHIGH ACRES, FL 33936", "FORECLOSURE OF MORTGAGE", "THE EAST 1/2 OF LOT 1, BLOCK 35"],
  },
  {
    sourceId: "lee-business-observer-foreclosure-sale",
    url: "https://legals.businessobserverfl.com/news/2026/aug/28/26-03493l/",
    markers: ["26-CA-001793", "3302 E 3RD ST, LEHIGH ACRES, FL 33936", "17 DAY OF SEPTEMBER, 2026", "THE EAST 1/2 OF LOT 1, BLOCK 35"],
  },
] as const

const VERIFIED_SAMPLE_SOURCES = [
  { sourceId: "lee-business-observer-notice-of-action", label: "May 8 notice of action" },
  { sourceId: "lee-business-observer-foreclosure-sale", label: "August 28 foreclosure-sale notice" },
  { sourceId: "lee-community-development-permit-report", label: "May 2021 Lee County permit report" },
] as const

const allowedOrigin = (url: string) => {
  const origin = new URL(url).origin
  return [...PERMITTED_LIVE_SOURCES, ...PROPERTY_EVIDENCE_SOURCES].some((source) => new URL(source.url).origin === origin)
}

const approvedSourceIds = () => new Set(
  (process.env.ACREBRIEF_APPROVED_SOURCE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
)

const update = (stage: InvestigationStage, message: string, extras: Omit<InvestigationUpdate, "stage" | "message" | "at"> = {}): InvestigationUpdate => ({ stage, message, at: new Date().toISOString(), ...extras })

export async function* replayVerifiedSample(): AsyncGenerator<InvestigationUpdate> {
  yield update("queued", "Verified sample replay queued — this is not a live Solari run.", { clearlyLabeledReplay: true })
  for (const source of VERIFIED_SAMPLE_SOURCES) yield update("source", `Replaying verified ${source.label} evidence.`, { sourceId: source.sourceId, status: "complete", clearlyLabeledReplay: true })
  yield update("normalizing", "Replaying normalized event graph and explainable score.", { clearlyLabeledReplay: true })
  yield update("complete", "Verified sample replay complete. Refresh with Live investigation when an authorized Solari run is configured.", { graph: verifiedSampleGraph, score: verifiedSampleScore, clearlyLabeledReplay: true })
}

async function runSolariSandbox(graph: PropertyGraph): Promise<{ sandboxId: string; score: OpportunityScore }> {
  const { SolariClient } = await import("@solarisdk/sdk")
  const client = new SolariClient({ apiKey: process.env.SOLARI_API_KEY! })
  const sandbox = await client.sandboxes.create({ template: "base", timeoutMs: 12_000, metadata: { product: "acrebrief", purpose: "evidence-quality-and-score-crosscheck" } })
  try {
    await sandbox.connect()
    // Data is serialized, never interpolated into a shell command. The sandbox
    // validates the evidence manifest and independently calculates the numeric
    // score; the server retains the human-readable reasons and rejects drift.
    const now = new Date()
    const serverScore = scoreOpportunity(graph, now)
    const propertyKey = graph.property.parcelId ?? graph.property.candidateId
    await sandbox.files.write("/tmp/acrebrief-input.json", JSON.stringify({
      propertyKey,
      events: graph.events.map(({ eventType, eventDate, sourceRecordId }) => ({ eventType, eventDate, sourceRecordId })),
      evidenceCount: graph.evidence.length,
      now: now.toISOString(),
    }))
    const scoringProgram = "const fs=require('fs');const x=JSON.parse(fs.readFileSync('/tmp/acrebrief-input.json','utf8'));if(!x.propertyKey||!x.events?.length||!x.evidenceCount||x.events.some(e=>!e.sourceRecordId))process.exit(2);let s=0;const types=new Set(x.events.map(e=>e.eventType));for(const e of x.events){const age=Math.floor((Date.parse(x.now)-Date.parse(e.eventDate))/86400000);if(age>=0&&age<=7)s+=18}if(types.has('NEW_FORECLOSURE_CASE'))s+=16;if(types.has('NEW_LIS_PENDENS'))s+=14;if(types.has('NEW_TAX_DELINQUENCY'))s+=12;if(types.has('NEW_LIEN'))s+=10;if(types.has('AUCTION_SCHEDULED'))s+=12;process.stdout.write(JSON.stringify({valid:true,score:Math.min(s,100),eventCount:x.events.length,evidenceCount:x.evidenceCount}))"
    const result = await sandbox.commands.run("node", { args: ["-e", scoringProgram] })
    if (result.exitCode !== 0) throw new Error("Sandbox evidence-manifest validation failed")
    const sandboxResult = JSON.parse(result.stdout) as { valid?: boolean; score?: number }
    if (!sandboxResult.valid || sandboxResult.score !== serverScore.score) throw new Error("Sandbox score cross-check detected algorithm drift")
    return { sandboxId: sandbox.sandboxId, score: serverScore }
  } finally {
    await sandbox.kill()
  }
}

export async function* runLiveInvestigation(input: InvestigationInput): AsyncGenerator<InvestigationUpdate> {
  if (!process.env.SOLARI_API_KEY) {
    yield update("configuration_required", "Live investigation is unavailable: SOLARI_API_KEY is not configured. Use the separately labeled verified sample replay; it does not claim a live Solari session.")
    return
  }
  const approved = approvedSourceIds()
  const approvedPortalSources = PERMITTED_LIVE_SOURCES.filter((source) => approved.has(source.sourceId))
  const approvedPropertySources = PROPERTY_EVIDENCE_SOURCES.filter((source) => approved.has(source.sourceId))
  if (approvedPropertySources.length === 0) {
    yield update("configuration_required", "Live investigation is disabled by the default-deny source policy. Approve at least one property-evidence source explicitly before enabling automation.")
    return
  }
  for (const source of PERMITTED_LIVE_SOURCES.filter((source) => !approved.has(source.sourceId))) {
    yield update("source", `${source.sourceId} is gated by the source-approval policy and was not opened.`, { sourceId: source.sourceId, status: "failed" })
  }
  for (const source of PROPERTY_EVIDENCE_SOURCES.filter((source) => !approved.has(source.sourceId))) {
    yield update("source", `${source.sourceId} is gated by the source-approval policy and was not opened.`, { sourceId: source.sourceId, status: "failed" })
  }
  yield update("queued", "Launching one recorded Solari Browser session for permitted Lee County public sources.")
  const { Solari } = await import("@solarisdk/browser")
  const solari = new Solari({ apiKey: process.env.SOLARI_API_KEY })
  let sessionId: string | undefined
  const observations: Evidence[] = []
  let completedSources = 0
  const propertyEvidenceSucceeded = new Set<string>()
  try {
    // The recorded session deliberately visits only generic government portal
    // entry points. Property-specific pages can contain names/contact details
    // and are checked in a separate, unrecorded session below.
    if (approvedPortalSources.length) {
      const browser = await solari.launch({ recording: true, retries: 1, probe: true })
      sessionId = browser.id
      try {
        const page = await browser.newPage()
        for (const source of approvedPortalSources) {
          if (!allowedOrigin(source.url)) throw new Error("Blocked non-allowlisted source")
          yield update("source", `Checking ${source.sourceId} in the recorded Solari Browser session.`, { sourceId: source.sourceId, status: "running", sessionId, replayStatus: "recording_requested" })
          try {
            await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 8_000 })
            const title = await page.title()
            observations.push({ evidenceId: `live_${sessionId}_${source.sourceId}`, sourceId: source.sourceId, sourceUrl: source.url, retrievedAt: new Date().toISOString(), rawValue: { pageTitle: title }, normalizedValue: { pageTitle: title }, confidence: "LOW", adapterVersion: "2026.09.01", note: "Live portal-availability evidence only. It does not assert a property-specific fact." })
            completedSources += 1
            yield update("source", `${source.sourceId} reached. No unverified fields were promoted to facts.`, { sourceId: source.sourceId, status: "complete", sessionId, replayStatus: "available_later" })
          } catch (error) {
            const message = error instanceof Error ? error.message : "source unavailable"
            yield update("source", `${source.sourceId} failed without stopping the remaining investigation: ${message}`, { sourceId: source.sourceId, status: "failed", sessionId, replayStatus: "available_later" })
          }
        }
      } finally { await browser.close() }
    }

    const evidenceBrowser = await solari.launch({ recording: false, retries: 1, probe: true })
    try {
      const page = await evidenceBrowser.newPage()
      for (const source of approvedPropertySources) {
        yield update("source", `Checking redacted property markers at ${source.sourceId} in a non-recorded Solari Browser session.`, { sourceId: source.sourceId, status: "running", sessionId })
        try {
          await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 8_000 })
          const body = (await page.locator("body").innerText({ timeout: 4_000 })).toUpperCase().replace(/\s+/g, " ")
          const markerMatches = Object.fromEntries(source.markers.map((marker) => [marker, body.includes(marker)]))
          const allMarkersMatched = Object.values(markerMatches).every(Boolean)
          observations.push({
            evidenceId: `live_${evidenceBrowser.id}_${source.sourceId}`,
            sourceId: source.sourceId,
            sourceUrl: source.url,
            retrievedAt: new Date().toISOString(),
            rawValue: { caseNumber: input.caseNumber, propertyAddress: input.propertyAddress, markerMatches },
            normalizedValue: { allMarkersMatched, contentSha256: createHash("sha256").update(body).digest("hex") },
            confidence: allMarkersMatched ? "HIGH" : "LOW",
            adapterVersion: "2026.09.01",
            note: "Live marker verification. The source page was not recorded and its full text was not retained because it includes unnecessary personal information.",
          })
          if (!allMarkersMatched) throw new Error("expected public-notice markers were incomplete")
          completedSources += 1
          propertyEvidenceSucceeded.add(source.sourceId)
          yield update("source", `${source.sourceId} matched the case, property, and event markers; only redacted booleans were retained.`, { sourceId: source.sourceId, status: "complete", sessionId })
        } catch (error) {
          const message = error instanceof Error ? error.message : "source unavailable"
          yield update("source", `${source.sourceId} failed without promoting facts: ${message}`, { sourceId: source.sourceId, status: "failed", sessionId })
        }
      }
    } finally { await evidenceBrowser.close() }

    if (propertyEvidenceSucceeded.size === 0) throw new Error("Property-specific sources did not corroborate a fresh result; portal reachability alone is not an investigation")
    yield update("normalizing", "Solari Sandbox is validating source identity and independently cross-checking the transparent score.", { sessionId })
    const liveEvents = verifiedSampleGraph.events.filter((event) =>
      (event.eventType === "NEW_FORECLOSURE_CASE" && propertyEvidenceSucceeded.has("lee-business-observer-notice-of-action"))
      || (event.eventType === "AUCTION_SCHEDULED" && propertyEvidenceSucceeded.has("lee-business-observer-foreclosure-sale")),
    )
    const graph: PropertyGraph = {
      property: verifiedSampleGraph.property,
      owners: [],
      courtCases: liveEvents.length ? verifiedSampleGraph.courtCases : [],
      events: liveEvents,
      evidence: observations,
    }
    const sandbox = await runSolariSandbox(graph)
    yield update("complete", `Live Solari investigation completed with ${completedSources}/${approvedPortalSources.length + approvedPropertySources.length} approved sources reached. The replay contains only generic portal entry points.`, { graph, score: sandbox.score, sessionId, sandboxId: sandbox.sandboxId, replayStatus: "available_later" })
  } catch (error) {
    yield update("failed", error instanceof Error ? `Live investigation failed safely: ${error.message}` : "Live investigation failed safely.", { sessionId })
  } finally { await solari.close() }
}
