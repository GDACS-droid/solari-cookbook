import { z } from "zod"
import { createHash } from "node:crypto"
import { fingerprintEvent, normalizeAddress, scoreOpportunity, stableId, type Evidence, type EventType, type OpportunityScore, type PropertyEvent, type PropertyGraph } from "@/lib/acrebrief"
import { sourcePolicyAllows, sourceRequestBudget, type RuntimeSourceId } from "@/lib/source-policy"
import { verifiedSampleGraph, verifiedSampleScore } from "@/lib/verified-sample"

export const investigationInput = z.object({
  mode: z.enum(["live", "verified_sample"]).default("verified_sample"),
  // The initial permitted demo is narrow on purpose: request data never controls a URL.
  caseNumber: z.literal("CAPE-CORAL-UTILITY-LIEN").default("CAPE-CORAL-UTILITY-LIEN"),
  propertyAddress: z.literal("413 SW 26th Ave, Cape Coral, FL 33991").default("413 SW 26th Ave, Cape Coral, FL 33991"),
}).strict()
export type InvestigationInput = z.infer<typeof investigationInput>
export type InvestigationStage = "queued" | "source" | "normalizing" | "complete" | "review_required" | "configuration_required" | "failed"
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

interface PortalSource {
  sourceId: string
  registrySourceId: RuntimeSourceId
  url: string
}

interface PropertyEvidenceSource extends PortalSource {
  sourceRecordId: string
  eventType: Extract<EventType, "FORECLOSURE_NOTICE_PUBLISHED" | "FORECLOSURE_SALE_NOTICE_PUBLISHED">
  eventDate: string
  effectiveDate: string
  legalDescription: string
  markers: ReadonlyArray<{ name: string; value: string }>
}

export const PERMITTED_LIVE_SOURCES: readonly PortalSource[] = [
  { sourceId: "lee-clerk-matrix", registrySourceId: "lee_clerk_court_records", url: "https://matrix.leeclerk.org/home/index" },
  { sourceId: "lee-property-appraiser", registrySourceId: "lee_property_appraiser", url: "https://www.leepa.org/Search/PropertySearch.aspx" },
  { sourceId: "lee-tax-collector", registrySourceId: "lee_tax_collector", url: "https://leetc.com/property-taxes/" },
]

const PROPERTY_EVIDENCE_SOURCES: readonly PropertyEvidenceSource[] = [
  {
    sourceId: "lee-business-observer-notice-of-action",
    registrySourceId: "lee_business_observer_legal_notices",
    url: "https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/",
    sourceRecordId: "26-01775L",
    eventType: "FORECLOSURE_NOTICE_PUBLISHED",
    eventDate: "2026-05-08",
    effectiveDate: "2026-05-08",
    legalDescription: "E 1/2 Lot 1 Block 35 Unit 9",
    markers: [
      { name: "case_number", value: "26-CA-001793" },
      { name: "property_address", value: "3302 E 3RD ST, LEHIGH ACRES, FL 33936" },
      { name: "notice_type", value: "FORECLOSURE OF MORTGAGE" },
      { name: "legal_description", value: "THE EAST 1/2 OF LOT 1, BLOCK 35" },
    ],
  },
  {
    sourceId: "lee-business-observer-foreclosure-sale",
    registrySourceId: "lee_business_observer_legal_notices",
    url: "https://legals.businessobserverfl.com/news/2026/aug/28/26-03493l/",
    sourceRecordId: "26-03493L",
    eventType: "FORECLOSURE_SALE_NOTICE_PUBLISHED",
    eventDate: "2026-08-28",
    effectiveDate: "2026-09-17",
    legalDescription: "E 1/2 Lot 1 Block 35 Unit 9",
    markers: [
      { name: "case_number", value: "26-CA-001793" },
      { name: "property_address", value: "3302 E 3RD ST, LEHIGH ACRES, FL 33936" },
      { name: "sale_date", value: "17 DAY OF SEPTEMBER, 2026" },
      { name: "legal_description", value: "THE EAST 1/2 OF LOT 1, BLOCK 35" },
    ],
  },
]

const VERIFIED_SAMPLE_SOURCES = [
  { sourceId: "florida_dor_property_tax_data", label: "Florida DOR 2026 preliminary Lee parcel record" },
  { sourceId: "cape_coral_open_data_utility_liens", label: "City Open Data active utility-lien record" },
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
const publicRunRef = (kind: "browser" | "sandbox", value: string) => `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`

export function assertApprovedNavigation(requestedUrl: string, finalUrl: string): void {
  const requested = new URL(requestedUrl)
  const final = new URL(finalUrl)
  if (requested.origin !== final.origin || requested.pathname !== final.pathname) {
    throw new Error("Source redirected outside its exact approved origin/path")
  }
}

/**
 * Builds a fresh graph only from evidence corroborated in this run. Event
 * evidence references are rebound to the live artifacts; fixture evidence IDs
 * must never leak into a live result.
 */
export function assembleLiveGraph(input: InvestigationInput, observations: Evidence[], successfulSourceIds: ReadonlySet<string>): PropertyGraph {
  const normalizedAddress = normalizeAddress(input.propertyAddress)
  const candidateId = stableId("property-candidate", "LEE", normalizedAddress)
  const caseId = stableId("case", "LEE", input.caseNumber)
  const events = PROPERTY_EVIDENCE_SOURCES.flatMap((source): PropertyEvent[] => {
    if (!successfulSourceIds.has(source.sourceId)) return []
    const evidence = observations.find((candidate) => candidate.sourceId === source.sourceId && candidate.confidence === "HIGH")
    if (!evidence) return []
    const eventWithoutFingerprint: Omit<PropertyEvent, "rawFingerprint"> = {
      eventId: stableId("event", source.registrySourceId, source.sourceRecordId, input.caseNumber),
      eventType: source.eventType,
      candidatePropertyId: candidateId,
      sourceRecordId: source.sourceRecordId,
      caseId,
      eventDate: source.eventDate,
      detectedAt: evidence.retrievedAt,
      match: "CANDIDATE",
      confidence: "MEDIUM",
      evidenceIds: [evidence.evidenceId],
    }
    return [{ ...eventWithoutFingerprint, rawFingerprint: fingerprintEvent(eventWithoutFingerprint) }]
  })
  const legalDescription = PROPERTY_EVIDENCE_SOURCES.find((source) => successfulSourceIds.has(source.sourceId))?.legalDescription
  return {
    property: { candidateId, county: "LEE", siteAddress: input.propertyAddress, normalizedAddress, legalDescription },
    owners: [],
    courtCases: events.length ? [{ caseId, courtCaseNumber: input.caseNumber, county: "LEE", caseType: "Circuit civil" }] : [],
    events,
    evidence: observations,
  }
}

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
    const scoringProgram = "const fs=require('fs');const x=JSON.parse(fs.readFileSync('/tmp/acrebrief-input.json','utf8'));if(!x.propertyKey||!x.events?.length||!x.evidenceCount||x.events.some(e=>!e.sourceRecordId))process.exit(2);let s=0;const types=new Set(x.events.map(e=>e.eventType));for(const e of x.events){const age=Math.floor((Date.parse(x.now)-Date.parse(e.eventDate))/86400000);if(age>=0&&age<=7)s+=18}if(types.has('NEW_FORECLOSURE_CASE'))s+=16;if(types.has('FORECLOSURE_NOTICE_PUBLISHED'))s+=10;if(types.has('FORECLOSURE_SALE_NOTICE_PUBLISHED'))s+=12;if(types.has('NEW_LIS_PENDENS'))s+=14;if(types.has('NEW_TAX_DELINQUENCY'))s+=12;if(types.has('NEW_LIEN'))s+=10;if(types.has('AUCTION_SCHEDULED'))s+=12;process.stdout.write(JSON.stringify({valid:true,score:Math.min(s,100),eventCount:x.events.length,evidenceCount:x.evidenceCount}))"
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
  const approvedPortalSources = PERMITTED_LIVE_SOURCES.filter((source) => sourcePolicyAllows(source.registrySourceId, source.url) && approved.has(source.registrySourceId))
  const approvedPropertySources = PROPERTY_EVIDENCE_SOURCES.filter((source) => sourcePolicyAllows(source.registrySourceId, source.url) && approved.has(source.registrySourceId))
  if (approvedPropertySources.length === 0) {
    yield update("configuration_required", "Live investigation is disabled by the reviewed source policy. A credential or environment source ID cannot override a registry source that remains REVIEW_REQUIRED.")
    return
  }
  for (const source of PERMITTED_LIVE_SOURCES.filter((source) => !approved.has(source.registrySourceId) || !sourcePolicyAllows(source.registrySourceId, source.url))) {
    yield update("source", `${source.sourceId} is gated by the source-approval policy and was not opened.`, { sourceId: source.sourceId, status: "failed" })
  }
  for (const source of PROPERTY_EVIDENCE_SOURCES.filter((source) => !approved.has(source.registrySourceId) || !sourcePolicyAllows(source.registrySourceId, source.url))) {
    yield update("source", `${source.sourceId} is gated by the source-approval policy and was not opened.`, { sourceId: source.sourceId, status: "failed" })
  }
  yield update("queued", "Launching non-recorded Solari Browser sessions for reviewed Lee County sources.")
  const { Solari } = await import("@solarisdk/browser")
  const solari = new Solari({ apiKey: process.env.SOLARI_API_KEY })
  let sessionId: string | undefined
  const observations: Evidence[] = []
  let completedSources = 0
  const propertyEvidenceSucceeded = new Set<string>()
  const sourceRequests = new Map<RuntimeSourceId, number>()
  const consumeSourceRequest = (source: PortalSource) => {
    const next = (sourceRequests.get(source.registrySourceId) ?? 0) + 1
    if (next > sourceRequestBudget(source.registrySourceId)) throw new Error(`${source.registrySourceId} exceeded its approved per-run request budget`)
    sourceRequests.set(source.registrySourceId, next)
  }
  try {
    // Recording stays disabled until provider retention/deletion and replay
    // review controls are implemented. Property-specific pages may contain
    // unnecessary personal information even when the requested page is public.
    if (approvedPortalSources.length) {
      const browser = await solari.launch({ recording: false, retries: 1, probe: true })
      sessionId = publicRunRef("browser", browser.id)
      try {
        const page = await browser.newPage()
        for (const source of approvedPortalSources) {
          if (!allowedOrigin(source.url)) throw new Error("Blocked non-allowlisted source")
          yield update("source", `Checking ${source.sourceId} in a non-recorded Solari Browser session.`, { sourceId: source.sourceId, status: "running", sessionId })
          try {
            consumeSourceRequest(source)
            await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 8_000 })
            assertApprovedNavigation(source.url, page.url())
            const title = await page.title()
            observations.push({ evidenceId: `live_${sessionId}_${source.sourceId}`, sourceId: source.sourceId, sourceUrl: source.url, retrievedAt: new Date().toISOString(), rawValue: { pageTitle: title }, normalizedValue: { pageTitle: title }, confidence: "LOW", adapterVersion: "2026.09.01", note: "Live portal-availability evidence only. It does not assert a property-specific fact." })
            completedSources += 1
            yield update("source", `${source.sourceId} reached. No unverified fields were promoted to facts.`, { sourceId: source.sourceId, status: "complete", sessionId })
          } catch (error) {
            const message = error instanceof Error ? error.message : "source unavailable"
            yield update("source", `${source.sourceId} failed without stopping the remaining investigation: ${message}`, { sourceId: source.sourceId, status: "failed", sessionId })
          }
        }
      } finally { await browser.close() }
    }

    const evidenceBrowser = await solari.launch({ recording: false, retries: 1, probe: true })
    const evidenceBrowserRef = publicRunRef("browser", evidenceBrowser.id)
    try {
      const page = await evidenceBrowser.newPage()
      for (const source of approvedPropertySources) {
        yield update("source", `Checking redacted property markers at ${source.sourceId} in a non-recorded Solari Browser session.`, { sourceId: source.sourceId, status: "running", sessionId })
        try {
          if (!allowedOrigin(source.url)) throw new Error("Blocked non-allowlisted source")
          consumeSourceRequest(source)
          await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 8_000 })
          assertApprovedNavigation(source.url, page.url())
          const body = (await page.locator("body").innerText({ timeout: 4_000 })).toUpperCase().replace(/\s+/g, " ")
          const markerMatches = Object.fromEntries(source.markers.map((marker) => [marker.name, body.includes(marker.value)]))
          const allMarkersMatched = Object.values(markerMatches).every(Boolean)
          observations.push({
            evidenceId: `live_${evidenceBrowserRef}_${source.sourceId}`,
            sourceId: source.sourceId,
            sourceUrl: source.url,
            retrievedAt: new Date().toISOString(),
            effectiveDate: source.effectiveDate,
            rawValue: { markerMatches },
            normalizedValue: { allMarkersMatched, matchedMarkerCount: Object.values(markerMatches).filter(Boolean).length, expectedMarkerCount: source.markers.length, contentSha256: createHash("sha256").update(body).digest("hex") },
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
    const graph = assembleLiveGraph(input, observations, propertyEvidenceSucceeded)
    const sandbox = await runSolariSandbox(graph)
    const score: OpportunityScore = { ...sandbox.score, confidence: "LOW", unknown: [...sandbox.score.unknown, "Current court and sale status were not corroborated by an approved official county source in this run"] }
    yield update("review_required", `Live publication verification reached ${completedSources}/${approvedPortalSources.length + approvedPropertySources.length} reviewed sources. Official county corroboration is still required; no recording was created and no official status is implied.`, { graph, score, sessionId, sandboxId: publicRunRef("sandbox", sandbox.sandboxId) })
  } catch (error) {
    yield update("failed", error instanceof Error ? `Live investigation failed safely: ${error.message}` : "Live investigation failed safely.", { sessionId })
  } finally { await solari.close() }
}
