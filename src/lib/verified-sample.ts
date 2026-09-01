import { fingerprintEvent, normalizeAddress, scoreOpportunity, stableId, type Evidence, type Parcel, type PropertyEvent, type PropertyGraph } from "@/lib/acrebrief"

/**
 * Evidence identifiers below identify public source pages and a publicly
 * observable case number only. This fixture intentionally excludes names,
 * phone numbers, email addresses, payment amounts, and inferred equity.
 * It is a replay fixture, not a substitute for a fresh Solari investigation.
 */
const parcel: Parcel = {
  candidateId: stableId("property_candidate", "LEE", "3302 E 3RD ST LEHIGH ACRES FL 33936"),
  county: "LEE",
  siteAddress: "3302 E 3rd St, Lehigh Acres, FL 33936",
  normalizedAddress: normalizeAddress("3302 E 3rd St, Lehigh Acres, FL 33936"),
  legalDescription: "E 1/2 Lot 1 Block 35 Unit 9",
}

const retrievedAt = "2026-08-31T15:00:00.000Z"
const evidence: Evidence[] = [
  {
    evidenceId: stableId("evidence", "lee-notice-of-action", "26-CA-001793"),
    sourceId: "lee-business-observer-legal-notice",
    sourceUrl: "https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/",
    retrievedAt,
    effectiveDate: "2026-05-08",
    rawValue: {
      publicationDate: "2026-05-08",
      caseNumber: "26-CA-001793",
      propertyAddress: "3302 E 3rd St, Lehigh Acres, FL 33936",
      legalDescription: "E 1/2 Lot 1 Block 35 Unit 9",
      noticeType: "Notice of action — foreclosure of mortgage",
    },
    normalizedValue: { caseNumber: "26-CA-001793", propertyAddress: parcel.normalizedAddress, legalDescription: parcel.legalDescription },
    confidence: "HIGH",
    adapterVersion: "2026.09.01",
    note: "Exact public legal-notice artifact. It confirms that an action was noticed, not the case filing date; confirm against the court docket before acting.",
  },
  {
    evidenceId: stableId("evidence", "lee-foreclosure-sale-notice", "26-CA-001793"),
    sourceId: "lee-business-observer-legal-notice",
    sourceUrl: "https://legals.businessobserverfl.com/news/2026/aug/28/26-03493l/",
    retrievedAt,
    effectiveDate: "2026-09-17",
    rawValue: {
      publicationDate: "2026-08-28",
      caseNumber: "26-CA-001793",
      propertyAddress: "3302 E 3rd St, Lehigh Acres, FL 33936",
      auctionAt: "2026-09-17T09:00:00-04:00",
      legalDescription: "E 1/2 Lot 1 Block 35 Unit 9",
    },
    normalizedValue: { caseNumber: "26-CA-001793", propertyAddress: parcel.normalizedAddress, legalDescription: parcel.legalDescription },
    confidence: "HIGH",
    adapterVersion: "2026.09.01",
    note: "Exact public foreclosure-sale notice. It is a newspaper legal notice, not a Lee County government site; confirm sale status against the court docket before acting.",
  },
  {
    evidenceId: stableId("evidence", "lee-permit-report", "RES2020-09004"),
    sourceId: "lee-community-development-permit-report",
    sourceUrl: "https://www.leegov.com/dcd/rpts/Documents/LehighPermits/2021/May/LA2021MayBPR.PDF",
    retrievedAt,
    effectiveDate: "2021-05-18",
    rawValue: {
      permitNumber: "RES2020-09004",
      siteAddress: "3302 E 3RD ST",
      parcelReference: "35-44-27-09-00035.001B",
      workType: "New SFR",
      totalSquareFeet: 2276,
      constructionValue: 160000,
    },
    normalizedValue: { siteAddress: normalizeAddress("3302 E 3RD ST LEHIGH ACRES FL 33936"), permitNumber: "RES2020-09004" },
    confidence: "HIGH",
    adapterVersion: "2026.09.01",
    note: "Official Lee County monthly permit report. The permit-era parcel reference is retained as raw evidence and is not asserted as a current assessor identifier.",
  },
]

const caseId = stableId("case", "LEE", "26-CA-001793")
const foreclosure: PropertyEvent = {
  eventId: stableId("event", "NEW_FORECLOSURE_CASE", caseId), eventType: "NEW_FORECLOSURE_CASE", candidatePropertyId: parcel.candidateId, sourceRecordId: "26-01775L", caseId,
  eventDate: "2026-05-08", detectedAt: retrievedAt, match: "CANDIDATE", confidence: "MEDIUM", evidenceIds: [evidence[0].evidenceId],
  rawFingerprint: fingerprintEvent({ eventType: "NEW_FORECLOSURE_CASE", candidatePropertyId: parcel.candidateId, sourceRecordId: "26-01775L", caseId, eventDate: "2026-05-08" }),
}

const auction: PropertyEvent = {
  eventId: stableId("event", "AUCTION_SCHEDULED", caseId, "2026-08-28"), eventType: "AUCTION_SCHEDULED", candidatePropertyId: parcel.candidateId, sourceRecordId: "26-03493L", caseId,
  eventDate: "2026-08-28", detectedAt: retrievedAt, match: "CANDIDATE", confidence: "MEDIUM", evidenceIds: [evidence[1].evidenceId],
  rawFingerprint: fingerprintEvent({ eventType: "AUCTION_SCHEDULED", candidatePropertyId: parcel.candidateId, sourceRecordId: "26-03493L", caseId, eventDate: "2026-08-28" }),
}

export const verifiedSampleGraph: PropertyGraph = {
  property: parcel,
  owners: [],
  courtCases: [{ caseId, courtCaseNumber: "26-CA-001793", county: "LEE", caseType: "Circuit civil" }],
  events: [foreclosure, auction], evidence,
}
export const verifiedSampleScore = scoreOpportunity(verifiedSampleGraph, new Date("2026-09-01T12:00:00.000Z"))
