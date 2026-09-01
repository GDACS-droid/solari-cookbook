import { createHash } from "node:crypto"
import { z } from "zod"
import { ADAPTER_VERSION, fingerprintEvent, normalizeAddress, scoreOpportunity, stableId, type Evidence, type OpportunityScore, type PropertyEvent, type PropertyGraph } from "@/lib/acrebrief"
import { assertApprovedNavigation, type InvestigationInput, type InvestigationUpdate } from "@/lib/investigation"
import { sourcePolicyAllows, sourceRequestBudget, type RuntimeSourceId } from "@/lib/source-policy"

const DOR_SOURCE_ID = "florida_dor_property_tax_data" as const
const CITY_SOURCE_ID = "cape_coral_open_data_utility_liens" as const
const DOR_PORTAL_URL = "https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx"
const DOR_NAL_URL = "https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip"
const CITY_LIEN_QUERY_URL = "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/6/query"

// The public competition route is deliberately one bounded, privacy-minimized
// investigation. Client input cannot choose a URL, parcel, SQL expression, or
// source record.
const LIVE_PARCEL_ID = "174423C3039260170"
const LIVE_CITY_OBJECT_ID = 1665843
const DOR_ARCHIVE_ENTRY = "NAL46P202601.csv"

const dorRecordSchema = z.object({
  countyNumber: z.literal("46"),
  parcelId: z.literal(LIVE_PARCEL_ID),
  assessmentYear: z.literal(2026),
  justValue: z.number().nonnegative(),
  assessedSchool: z.number().nonnegative(),
  assessedNonSchool: z.number().nonnegative(),
  taxableSchool: z.number().nonnegative(),
  taxableNonSchool: z.number().nonnegative(),
  landValue: z.number().nonnegative(),
  landSquareFeet: z.number().nonnegative(),
  actualYearBuilt: z.number().int().nullable(),
  livingAreaSquareFeet: z.number().nonnegative().nullable(),
  buildingCount: z.number().int().nonnegative().nullable(),
  landUseCode: z.string().trim().min(1).max(12),
  siteAddress: z.literal("413 SW 26TH AVE"),
  siteCity: z.literal("CAPE CORAL"),
  siteZip: z.literal("33991"),
  legalDescription: z.string().trim().min(1).max(2_000),
  stateParcelId: z.string().trim().min(1).max(80),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  schemaSha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export type DorPropertyRecord = z.infer<typeof dorRecordSchema>

const cityResponseSchema = z.object({
  features: z.array(z.object({
    attributes: z.object({
      Strap: z.string().refine((value) => value.trim() === LIVE_PARCEL_ID, "unexpected City STRAP"),
      Date_Liened: z.number().int().min(Date.UTC(1900, 0, 1)).max(Date.UTC(2100, 0, 1)),
      Lien_Number: z.string().refine((value) => value.trim().length > 0 && value.trim().length <= 80, "invalid lien reference"),
      Lien_Amount: z.number().nonnegative(),
      Lien_Release_Date: z.number().int().nullable(),
      Active_Lien: z.literal("Y"),
      OBJECTID: z.literal(LIVE_CITY_OBJECT_ID),
    }).strict(),
  })).length(1),
  error: z.never().optional(),
}).passthrough()

const update = (stage: InvestigationUpdate["stage"], message: string, extras: Omit<InvestigationUpdate, "stage" | "message" | "at"> = {}): InvestigationUpdate => ({ stage, message, at: new Date().toISOString(), ...extras })
const publicRunRef = (kind: "browser" | "sandbox", value: string) => `${kind}_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`

async function createSolariClients(apiKey: string) {
  const [{ Solari }, { SolariClient }] = await Promise.all([
    import("@solarisdk/browser"),
    import("@solarisdk/sdk"),
  ])
  return {
    browserClient: new Solari({ apiKey }),
    sandboxClient: new SolariClient({ apiKey }),
  }
}

export function createSourceRequestConsumer(): (sourceId: RuntimeSourceId) => void {
  const sourceRequests = new Map<RuntimeSourceId, number>()
  return (sourceId) => {
    const next = (sourceRequests.get(sourceId) ?? 0) + 1
    if (next > sourceRequestBudget(sourceId)) throw new Error(`${sourceId} exceeded its approved physical-request budget`)
    sourceRequests.set(sourceId, next)
  }
}

export const NAL_PARSER_PROGRAM = String.raw`
import csv, hashlib, json, math, sys
file, parcel, sha = sys.argv[1:]
required = ['CO_NO','PARCEL_ID','ASMNT_YR','JV','AV_SD','AV_NSD','TV_SD','TV_NSD','LND_VAL','LND_SQFOOT','ACT_YR_BLT','TOT_LVG_AREA','NO_BULDNG','DOR_UC','PHY_ADDR1','PHY_CITY','PHY_ZIPCD','S_LEGAL','STATE_PAR_ID']
def number(row, name, nullable=False, integer=False):
    value = row[name].strip()
    if nullable and value == '': return None
    try: result = float(value)
    except ValueError: raise RuntimeError('invalid numeric field: ' + name)
    if not math.isfinite(result): raise RuntimeError('non-finite numeric field: ' + name)
    if integer:
        if not result.is_integer(): raise RuntimeError('non-integer field: ' + name)
        return int(result)
    return result
with open(file, newline='', encoding='utf-8-sig', errors='strict') as stream:
    reader = csv.DictReader(stream, strict=True)
    header = reader.fieldnames or []
    if len(header) != len(set(header)): raise RuntimeError('duplicate DOR header')
    missing = [name for name in required if name not in header]
    if missing: raise RuntimeError('missing DOR headers: ' + ','.join(missing))
    schema_sha = hashlib.sha256(json.dumps(header,separators=(',',':')).encode()).hexdigest()
    matches = []
    for row in reader:
        if row['PARCEL_ID'] != parcel: continue
        matches.append({
          'countyNumber': row['CO_NO'].strip(), 'parcelId': row['PARCEL_ID'], 'assessmentYear': number(row,'ASMNT_YR',integer=True),
          'justValue': number(row,'JV'), 'assessedSchool': number(row,'AV_SD'), 'assessedNonSchool': number(row,'AV_NSD'),
          'taxableSchool': number(row,'TV_SD'), 'taxableNonSchool': number(row,'TV_NSD'), 'landValue': number(row,'LND_VAL'),
          'landSquareFeet': number(row,'LND_SQFOOT'), 'actualYearBuilt': number(row,'ACT_YR_BLT',True,True),
          'livingAreaSquareFeet': number(row,'TOT_LVG_AREA',True), 'buildingCount': number(row,'NO_BULDNG',True,True),
          'landUseCode': row['DOR_UC'].strip(), 'siteAddress': row['PHY_ADDR1'].strip(), 'siteCity': row['PHY_CITY'].strip(),
          'siteZip': row['PHY_ZIPCD'].strip(), 'legalDescription': row['S_LEGAL'].strip(), 'stateParcelId': row['STATE_PAR_ID'].strip(),
          'archiveSha256': sha, 'schemaSha256': schema_sha
        })
        if len(matches) > 1: raise RuntimeError('duplicate exact parcel rows')
    if len(matches) != 1: raise RuntimeError('exact parcel not found')
    print(json.dumps(matches[0], separators=(',',':')))
`

const ZIP_VALIDATOR_PROGRAM = String.raw`
import json, pathlib, sys, zipfile
archive, expected, destination = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    entries = z.infolist()
    if len(entries) != 1:
        raise RuntimeError("archive must contain exactly one entry")
    entry = entries[0]
    if entry.filename != expected or pathlib.PurePosixPath(entry.filename).is_absolute() or ".." in pathlib.PurePosixPath(entry.filename).parts:
        raise RuntimeError("unexpected archive entry")
    if entry.flag_bits & 1:
        raise RuntimeError("encrypted archive is not allowed")
    if entry.compress_size > 60000000 or entry.file_size > 400000000:
        raise RuntimeError("archive exceeds approved size ceiling")
    pathlib.Path(destination).mkdir(parents=True, exist_ok=True)
    target = pathlib.Path(destination, expected)
    with z.open(entry) as source, target.open("wb") as output:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk: break
            output.write(chunk)
    print(json.dumps({"entry": entry.filename, "compressedBytes": entry.compress_size, "uncompressedBytes": entry.file_size}))
`

function cityQueryUrl(): string {
  const url = new URL(CITY_LIEN_QUERY_URL)
  url.searchParams.set("where", `OBJECTID=${LIVE_CITY_OBJECT_ID}`)
  url.searchParams.set("outFields", "Strap,Date_Liened,Lien_Number,Lien_Amount,Lien_Release_Date,Active_Lien,OBJECTID")
  url.searchParams.set("returnGeometry", "false")
  url.searchParams.set("f", "json")
  return url.toString()
}

const abortableDelay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason ?? new Error("Investigation cancelled"))
  const timer = setTimeout(resolve, milliseconds)
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new Error("Investigation cancelled")) }, { once: true })
})

async function fetchCityLien(signal: AbortSignal, consumeRequest: (sourceId: RuntimeSourceId) => void): Promise<z.infer<typeof cityResponseSchema>["features"][number]["attributes"]> {
  if (!sourcePolicyAllows(CITY_SOURCE_ID, CITY_LIEN_QUERY_URL)) throw new Error("City Open Data source is not approved by the generated registry policy")
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      consumeRequest(CITY_SOURCE_ID)
      const response = await fetch(cityQueryUrl(), { cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), headers: { Accept: "application/json" } })
      if (!response.ok) {
        if (attempt < 2 && (response.status === 408 || response.status === 429 || response.status >= 500)) {
          await abortableDelay(500, signal)
          continue
        }
        throw new Error(`City Open Data returned HTTP ${response.status}`)
      }
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) throw new Error("City Open Data returned a non-JSON response")
      return cityResponseSchema.parse(await response.json()).features[0].attributes
    } catch (error) {
      if (signal.aborted || attempt === 2 || error instanceof z.ZodError) throw error
      await abortableDelay(500, signal)
    }
  }
  throw new Error("City Open Data retry budget exhausted")
}

export function assembleOfficialGraph(dor: DorPropertyRecord, city: Awaited<ReturnType<typeof fetchCityLien>>, retrievedAt: string): PropertyGraph {
  const strap = city.Strap.trim()
  if (strap !== dor.parcelId) throw new Error("City STRAP did not exactly match the DOR parcel identifier")
  const propertyId = stableId("property", "LEE", dor.parcelId)
  const cityRowId = stableId("city-lien-row", strap, city.Lien_Number.trim(), String(city.Date_Liened), String(city.Lien_Amount), city.Active_Lien, String(city.Lien_Release_Date))
  const dorEvidence: Evidence = {
    evidenceId: stableId("evidence", DOR_SOURCE_ID, dor.archiveSha256, dor.parcelId),
    sourceId: DOR_SOURCE_ID,
    sourceUrl: DOR_NAL_URL,
    artifactUrl: DOR_NAL_URL,
    retrievedAt,
    effectiveDate: `${dor.assessmentYear}-01-01`,
    rawValue: { ...dor },
    normalizedValue: { parcelId: dor.parcelId, normalizedAddress: normalizeAddress(`${dor.siteAddress}, ${dor.siteCity}, FL ${dor.siteZip}`), assessmentStatus: "2026 PRELIMINARY ROLL" },
    confidence: "HIGH",
    adapterVersion: ADAPTER_VERSION,
    note: "SOURCE FACTS · Exact privacy-minimized parcel row parsed from Florida DOR's current 2026 preliminary Lee NAL public download in an isolated Solari Sandbox. Owner and mailing columns were not emitted or retained.",
  }
  const eventDate = new Date(city.Date_Liened).toISOString().slice(0, 10)
  const cityEvidence: Evidence = {
    evidenceId: stableId("evidence", CITY_SOURCE_ID, cityRowId),
    sourceId: CITY_SOURCE_ID,
    sourceUrl: cityQueryUrl(),
    retrievedAt,
    effectiveDate: eventDate,
    rawValue: { strap, dateLiened: eventDate, lienReference: city.Lien_Number.trim(), lienAmount: city.Lien_Amount, releaseDate: city.Lien_Release_Date, activeLien: city.Active_Lien, objectId: city.OBJECTID },
    normalizedValue: { parcelId: strap, activeMunicipalUtilityLien: true, lienAmount: city.Lien_Amount },
    confidence: "HIGH",
    adapterVersion: ADAPTER_VERSION,
    note: "SOURCE FACTS · The just-retrieved City Open Data row reports Active_Lien=Y. This does not establish lien priority, payoff, title condition, or seller intent.",
  }
  const eventWithoutFingerprint: Omit<PropertyEvent, "rawFingerprint"> = {
    eventId: stableId("event", CITY_SOURCE_ID, cityRowId),
    eventType: "LIEN_STATUS_ACTIVE",
    propertyId,
    sourceRecordId: cityRowId,
    eventDate,
    detectedAt: retrievedAt,
    match: "EXACT",
    confidence: "HIGH",
    evidenceIds: [cityEvidence.evidenceId, dorEvidence.evidenceId],
  }
  return {
    property: {
      parcelId: propertyId,
      countyParcelId: dor.parcelId,
      strap: dor.parcelId,
      county: "LEE",
      siteAddress: `${dor.siteAddress}, ${dor.siteCity}, FL ${dor.siteZip}`,
      normalizedAddress: normalizeAddress(`${dor.siteAddress}, ${dor.siteCity}, FL ${dor.siteZip}`),
      legalDescription: dor.legalDescription,
      assessment: { year: dor.assessmentYear, status: "PRELIMINARY", justValue: dor.justValue, assessedValue: dor.assessedNonSchool, taxableValue: dor.taxableNonSchool, landValue: dor.landValue, actualYearBuilt: dor.actualYearBuilt, livingAreaSquareFeet: dor.livingAreaSquareFeet, landUseCode: dor.landUseCode },
    },
    owners: [],
    courtCases: [],
    events: [{ ...eventWithoutFingerprint, rawFingerprint: fingerprintEvent(eventWithoutFingerprint) }],
    evidence: [dorEvidence, cityEvidence],
  }
}

export async function* runOfficialLiveInvestigation(input: InvestigationInput, requestSignal?: AbortSignal): AsyncGenerator<InvestigationUpdate> {
  if (input.propertyAddress !== "413 SW 26th Ave, Cape Coral, FL 33991") {
    yield update("configuration_required", "The public live route is locked to the reviewed demo property.")
    return
  }
  if (!process.env.SOLARI_API_KEY) {
    yield update("configuration_required", "Live official-data investigation is unavailable because the server Solari key is not configured. No sample fallback was substituted.")
    return
  }
  if (!sourcePolicyAllows(DOR_SOURCE_ID, DOR_PORTAL_URL) || !sourcePolicyAllows(DOR_SOURCE_ID, DOR_NAL_URL)) {
    yield update("configuration_required", "Florida DOR is not LIVE_READY under the generated source policy.")
    return
  }

  let clients: Awaited<ReturnType<typeof createSolariClients>>
  try {
    clients = await createSolariClients(process.env.SOLARI_API_KEY)
  } catch {
    yield update("failed", "Live official-data investigation failed safely while initializing the Solari runtime. No source facts were added.")
    return
  }
  const { browserClient, sandboxClient } = clients
  let browserSessionRef: string | undefined
  let sandboxRef: string | undefined
  let sandbox: Awaited<ReturnType<typeof sandboxClient.sandboxes.create>> | undefined
  let browser: Awaited<ReturnType<typeof browserClient.launch>> | undefined
  const consumeSourceRequest = createSourceRequestConsumer()
  const deadline = AbortSignal.timeout(4 * 60_000)
  const signal = requestSignal ? AbortSignal.any([requestSignal, deadline]) : deadline
  const terminateRemoteResources = () => {
    void sandbox?.kill().catch(() => undefined)
    void browser?.close().catch(() => undefined)
  }
  signal.addEventListener("abort", terminateRemoteResources, { once: true })

  try {
    signal.throwIfAborted()
    yield update("queued", "Live official-data run started: Florida DOR first, then City of Cape Coral Open Data. No publisher or Clerk page is in the critical path.")
    yield update("source", "Solari Browser is opening Florida DOR's public assessment-roll catalog.", { sourceId: DOR_SOURCE_ID, status: "running" })
    const launchedBrowser = await browserClient.launch({ recording: false, retries: 1, probe: true })
    browser = launchedBrowser
    if (signal.aborted) {
      await launchedBrowser.close().catch(() => undefined)
      browser = undefined
      throw signal.reason ?? new Error("Investigation cancelled")
    }
    browserSessionRef = publicRunRef("browser", launchedBrowser.id)
    try {
      const page = await launchedBrowser.newPage()
      consumeSourceRequest(DOR_SOURCE_ID)
      await page.goto(DOR_PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 15_000 })
      assertApprovedNavigation(DOR_PORTAL_URL, page.url())
      const title = await page.title()
      if (!/Florida|Revenue|Property/i.test(title)) throw new Error("DOR catalog identity check failed")
      yield update("source", "Florida DOR catalog verified in Solari Browser; the current Lee roll will be processed from its public download.", { sourceId: DOR_SOURCE_ID, status: "complete", sessionId: browserSessionRef })
    } finally {
      await launchedBrowser.close()
      browser = undefined
    }

    yield update("source", "Solari Sandbox is downloading, validating, and privacy-projecting the current 2026 Lee preliminary NAL roll.", { sourceId: "florida-dor-lee-nal", status: "running", sessionId: browserSessionRef })
    const createdSandbox = await sandboxClient.sandboxes.create({ template: "base", timeoutMs: 5 * 60_000, metadata: { product: "acrebrief", purpose: "official-dor-roll-parse" } })
    sandbox = createdSandbox
    if (signal.aborted) {
      await createdSandbox.kill().catch(() => undefined)
      sandbox = undefined
      throw signal.reason ?? new Error("Investigation cancelled")
    }
    sandboxRef = publicRunRef("sandbox", createdSandbox.sandboxId)
    await createdSandbox.connect()
    signal.throwIfAborted()
    let downloaded = false
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      consumeSourceRequest(DOR_SOURCE_ID)
      const download = await createdSandbox.commands.run("curl", { args: ["--fail", "--silent", "--show-error", "--proto", "=https", "--connect-timeout", "10", "--max-time", "180", "--max-redirs", "0", "--max-filesize", "60000000", "--output", "/tmp/lee-nal.zip", DOR_NAL_URL] })
      if (download.exitCode === 0) {
        downloaded = true
        break
      }
      if (attempt < 3) await abortableDelay(500 * attempt, signal)
    }
    if (!downloaded) throw new Error("Sandbox could not download the bounded DOR archive within its request budget")
    const extract = await createdSandbox.commands.run("python3", { args: ["-c", ZIP_VALIDATOR_PROGRAM, "/tmp/lee-nal.zip", DOR_ARCHIVE_ENTRY, "/tmp/dor"] })
    if (extract.exitCode !== 0) throw new Error("DOR archive validation or bounded extraction failed")
    z.object({ entry: z.literal(DOR_ARCHIVE_ENTRY), compressedBytes: z.number().max(60_000_000), uncompressedBytes: z.number().max(400_000_000) }).parse(JSON.parse(extract.stdout))
    const digest = await createdSandbox.commands.run("sha256sum", { args: ["/tmp/lee-nal.zip"] })
    const archiveSha256 = digest.stdout.trim().split(/\s+/)[0]
    if (!/^[a-f0-9]{64}$/.test(archiveSha256)) throw new Error("DOR archive checksum failed")
    const parsed = await createdSandbox.commands.run("python3", { args: ["-c", NAL_PARSER_PROGRAM, `/tmp/dor/${DOR_ARCHIVE_ENTRY}`, LIVE_PARCEL_ID, archiveSha256] })
    if (parsed.exitCode !== 0) throw new Error("DOR exact-parcel projection failed")
    const dor = dorRecordSchema.parse(JSON.parse(parsed.stdout))
    yield update("source", `DOR exact parcel ${dor.parcelId} resolved from the 2026 preliminary roll; owner and mailing fields were discarded.`, { sourceId: "florida-dor-lee-nal", status: "complete", sessionId: browserSessionRef, sandboxId: sandboxRef })

    yield update("source", "Querying the City's exact Open Data utility-lien record with contact/account fields excluded.", { sourceId: CITY_SOURCE_ID, status: "running", sessionId: browserSessionRef, sandboxId: sandboxRef })
    signal.throwIfAborted()
    const city = await fetchCityLien(signal, consumeSourceRequest)
    const retrievedAt = new Date().toISOString()
    const minimalCity = { strap: city.Strap.trim(), lienReference: city.Lien_Number.trim(), lienAmount: city.Lien_Amount, dateLiened: new Date(city.Date_Liened).toISOString().slice(0, 10), activeLien: city.Active_Lien, releaseDate: city.Lien_Release_Date, objectId: city.OBJECTID }
    await createdSandbox.files.write("/tmp/city-lien.json", JSON.stringify(minimalCity))
    const join = await createdSandbox.commands.run("node", { args: ["-e", "const fs=require('fs');const x=JSON.parse(fs.readFileSync('/tmp/city-lien.json','utf8'));const expected=process.argv[1];if(x.strap!==expected||x.activeLien!=='Y'||x.releaseDate!==null||!Number.isFinite(x.lienAmount))process.exit(2);process.stdout.write(JSON.stringify({exactParcelJoin:true,activeLien:true,manifestSha256:require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex')}))", LIVE_PARCEL_ID] })
    if (join.exitCode !== 0) throw new Error("Sandbox rejected the City-to-DOR exact parcel join")
    const joinManifest = z.object({ exactParcelJoin: z.literal(true), activeLien: z.literal(true), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(join.stdout))
    yield update("source", `City Open Data currently reports the selected municipal utility-lien row active; Solari Sandbox confirmed the exact STRAP→DOR join (${joinManifest.manifestSha256.slice(0, 10)}…).`, { sourceId: CITY_SOURCE_ID, status: "complete", sessionId: browserSessionRef, sandboxId: sandboxRef })

    yield update("normalizing", "Solari Sandbox validated the source manifests; AcreBrief is separating source facts, calculations, and unavailable claims.", { sessionId: browserSessionRef, sandboxId: sandboxRef })
    const graph = assembleOfficialGraph(dor, city, retrievedAt)
    const calculated = scoreOpportunity(graph, new Date())
    const score: OpportunityScore = {
      ...calculated,
      unknown: [
        ...calculated.unknown,
        "Current foreclosure, court, and auction status were not checked in this open-data run",
        "Lien priority, current payoff, title condition, and seller intent are unavailable",
      ],
    }
    yield update("complete", "LIVE_READY investigation complete: current official Florida DOR roll + current City Open Data lien status + exact parcel join, validated in Solari Sandbox.", { graph, score, sessionId: browserSessionRef, sandboxId: sandboxRef })
  } catch (error) {
    yield update("failed", error instanceof Error ? `Live official-data investigation failed safely: ${error.message}` : "Live official-data investigation failed safely.", { sessionId: browserSessionRef, sandboxId: sandboxRef })
  } finally {
    signal.removeEventListener("abort", terminateRemoteResources)
    if (sandbox) await sandbox.kill().catch(() => undefined)
    if (browser) await browser.close().catch(() => undefined)
    await browserClient.close().catch(() => undefined)
  }
}

export const OFFICIAL_LIVE_SOURCE_URLS = { DOR_PORTAL_URL, DOR_NAL_URL, CITY_LIEN_QUERY_URL }
export const OFFICIAL_LIVE_PARCEL_ID = LIVE_PARCEL_ID
