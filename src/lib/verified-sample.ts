import { fingerprintEvent, normalizeAddress, scoreOpportunity, stableId, type Evidence, type PropertyEvent, type PropertyGraph } from "@/lib/acrebrief"

/** Privacy-minimized replay of the first fresh-event official-data investigation. */
const retrievedAt = "2026-09-01T15:11:48.000Z"
const sourceAddress = "1447 SE 17TH TER, CAPE CORAL, FL 33990"
const propertyId = stableId("property", "LEE", "304424C2007000560")

const dorEvidence: Evidence = {
  evidenceId: stableId("evidence", "florida_dor_property_tax_data", "2026P", "304424C2007000560"),
  sourceId: "florida_dor_property_tax_data",
  sourceUrl: "https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip",
  artifactUrl: "https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip",
  retrievedAt,
  effectiveDate: "2026-01-01",
  rawValue: { countyNumber: 46, parcelId: "304424C2007000560", assessmentYear: 2026, justValue: 368980, assessedValue: 368980, taxableValue: 368980, landValue: 66215, actualYearBuilt: 2005, livingAreaSquareFeet: 3694, siteAddress: "1447 SE 17TH TER", siteCity: "CAPE CORAL", siteZip: "33990", legalDescription: "CAPE CORAL UNIT 21", landUseCode: "001" },
  normalizedValue: { parcelId: "304424C2007000560", normalizedAddress: normalizeAddress(sourceAddress), assessmentStatus: "2026 PRELIMINARY ROLL" },
  confidence: "HIGH",
  adapterVersion: "2026.09.01",
  note: "SOURCE FACTS · Privacy-minimized projection from Florida DOR's 2026 preliminary Lee NAL public download. Owner and mailing columns are excluded.",
}

const cityEvidence: Evidence = {
  evidenceId: stableId("evidence", "cape_coral_open_data_code_cases", "d07a6590-aa57-4739-a755-e4b72128b335"),
  sourceId: "cape_coral_open_data_code_cases",
  sourceUrl: "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5/query",
  retrievedAt,
  sourceUpdatedAt: "2026-08-31T17:43:32.640Z",
  effectiveDate: "2026-08-31T17:42:42.000Z",
  rawValue: { municipalCaseId: "d07a6590-aa57-4739-a755-e4b72128b335", caseNumber: "CODE26-020878", status: "Open", openedAt: "2026-08-31T17:42:42.000Z", sourceUpdatedAt: "2026-08-31T17:43:32.640Z", caseType: "FORECLOSURE REGISTRATION", caseSubtype: "REGISTERED", parcelId: "304424C2007000560", siteAddress: "1447 SE 17TH TER", siteCity: "Cape Coral", siteState: "FL", siteZip: "33990" },
  normalizedValue: { parcelId: "304424C2007000560", foreclosureRegistration: true, status: "OPEN", sourceOpenedAt: "2026-08-31T17:42:42.000Z" },
  confidence: "HIGH",
  adapterVersion: "2026.09.01",
  note: "SOURCE FACTS · Municipal FORECLOSURE REGISTRATION marked REGISTERED and Open. This is not a court filing, judgment, sale date, or proof of title condition.",
}

const eventWithoutFingerprint: Omit<PropertyEvent, "rawFingerprint"> = {
  eventId: stableId("event", "cape_coral_open_data_code_cases", "d07a6590-aa57-4739-a755-e4b72128b335"),
  eventType: "FORECLOSURE_REGISTRATION_OPENED",
  propertyId,
  sourceRecordId: "d07a6590-aa57-4739-a755-e4b72128b335",
  eventDate: "2026-08-31T17:42:42.000Z",
  firstSeenAt: retrievedAt,
  detectedAt: retrievedAt,
  match: "EXACT",
  confidence: "HIGH",
  evidenceIds: [cityEvidence.evidenceId, dorEvidence.evidenceId],
}

export const verifiedSampleGraph: PropertyGraph = {
  property: {
    parcelId: propertyId,
    countyParcelId: "304424C2007000560",
    strap: "304424C2007000560",
    county: "LEE",
    siteAddress: sourceAddress,
    normalizedAddress: normalizeAddress(sourceAddress),
    legalDescription: "CAPE CORAL UNIT 21",
    assessment: { year: 2026, status: "PRELIMINARY", justValue: 368980, assessedValue: 368980, taxableValue: 368980, landValue: 66215, actualYearBuilt: 2005, livingAreaSquareFeet: 3694, landUseCode: "001" },
  },
  owners: [],
  courtCases: [],
  events: [{ ...eventWithoutFingerprint, rawFingerprint: fingerprintEvent(eventWithoutFingerprint) }],
  evidence: [dorEvidence, cityEvidence],
}

export const verifiedSampleScore = scoreOpportunity(verifiedSampleGraph, new Date("2026-09-01T15:11:48.000Z"))
