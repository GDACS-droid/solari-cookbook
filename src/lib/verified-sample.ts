import { fingerprintEvent, normalizeAddress, scoreOpportunity, stableId, type Evidence, type PropertyEvent, type PropertyGraph } from "@/lib/acrebrief"

/** Privacy-minimized replay of the first successful official-data investigation. */
const retrievedAt = "2026-09-01T16:00:00.000Z"
const sourceAddress = "413 SW 26TH AVE, CAPE CORAL, FL 33991"
const propertyId = stableId("property", "LEE", "174423C3039260170")

const dorEvidence: Evidence = {
  evidenceId: stableId("evidence", "florida_dor_property_tax_data", "2026P", "174423C3039260170"),
  sourceId: "florida_dor_property_tax_data",
  sourceUrl: "https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip",
  artifactUrl: "https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip",
  retrievedAt,
  effectiveDate: "2026-01-01",
  rawValue: { countyNumber: 46, parcelId: "174423C3039260170", assessmentYear: 2026, justValue: 238922, assessedValue: 98677, taxableValue: 0, landValue: 55718, actualYearBuilt: 2005, livingAreaSquareFeet: 2545, siteAddress: "413 SW 26TH AVE", siteCity: "CAPE CORAL", siteZip: "33991", legalDescription: "CAPE CORAL UNIT 54", landUseCode: "001" },
  normalizedValue: { parcelId: "174423C3039260170", normalizedAddress: normalizeAddress(sourceAddress), assessmentStatus: "2026 PRELIMINARY ROLL" },
  confidence: "HIGH",
  adapterVersion: "2026.09.01",
  note: "SOURCE FACTS · Privacy-minimized projection from Florida DOR's 2026 preliminary Lee NAL public download. Owner and mailing columns are excluded.",
}

const cityEvidence: Evidence = {
  evidenceId: stableId("evidence", "cape_coral_open_data_utility_liens", "1665843", "2022000068029"),
  sourceId: "cape_coral_open_data_utility_liens",
  sourceUrl: "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/6/query",
  retrievedAt,
  effectiveDate: "2022-02-25",
  rawValue: { strap: "174423C3039260170", dateLiened: "2022-02-25", lienReference: "2022000068029", lienAmount: 12314.43, lienReleaseDate: null, activeLien: "Y", objectId: 1665843 },
  normalizedValue: { parcelId: "174423C3039260170", activeMunicipalUtilityLien: true, lienAmount: 12314.43 },
  confidence: "HIGH",
  adapterVersion: "2026.09.01",
  note: "SOURCE FACTS · The City Open Data response reported Active_Lien=Y at retrieval. This is not proof of title priority, current payoff, or seller intent.",
}

const eventWithoutFingerprint: Omit<PropertyEvent, "rawFingerprint"> = {
  eventId: stableId("event", "cape_coral_open_data_utility_liens", "1665843", "2022000068029"),
  eventType: "LIEN_STATUS_ACTIVE",
  propertyId,
  sourceRecordId: "1665843:2022000068029",
  eventDate: "2022-02-25",
  detectedAt: retrievedAt,
  match: "EXACT",
  confidence: "HIGH",
  evidenceIds: [cityEvidence.evidenceId, dorEvidence.evidenceId],
}

export const verifiedSampleGraph: PropertyGraph = {
  property: {
    parcelId: propertyId,
    countyParcelId: "174423C3039260170",
    strap: "174423C3039260170",
    county: "LEE",
    siteAddress: sourceAddress,
    normalizedAddress: normalizeAddress(sourceAddress),
    legalDescription: "CAPE CORAL UNIT 54",
    assessment: { year: 2026, status: "PRELIMINARY", justValue: 238922, assessedValue: 98677, taxableValue: 0, landValue: 55718, actualYearBuilt: 2005, livingAreaSquareFeet: 2545, landUseCode: "001" },
  },
  owners: [],
  courtCases: [],
  events: [{ ...eventWithoutFingerprint, rawFingerprint: fingerprintEvent(eventWithoutFingerprint) }],
  evidence: [dorEvidence, cityEvidence],
}

export const verifiedSampleScore = scoreOpportunity(verifiedSampleGraph, new Date("2026-09-01T16:00:00.000Z"))
