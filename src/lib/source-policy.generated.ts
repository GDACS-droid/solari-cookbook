/* This file is generated from data/source_registry.yaml. Do not edit by hand. */
export const GENERATED_SOURCE_POLICY = {
  "lee_business_observer_legal_notices": {
    "accessBasis": "REVIEW_REQUIRED",
    "automationApproval": "REVIEW_REQUIRED",
    "exactUrls": [
      "https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/",
      "https://legals.businessobserverfl.com/news/2026/aug/28/26-03493l/"
    ],
    "termsReviewedAt": "2026-09-01",
    "approvalExpiresAt": null,
    "accountableReviewer": null,
    "maxRequestsPerRun": 0
  },
  "lee_clerk_court_records": {
    "accessBasis": "REVIEW_REQUIRED",
    "automationApproval": "REVIEW_REQUIRED",
    "exactUrls": [
      "https://matrix.leeclerk.org/home/index"
    ],
    "termsReviewedAt": null,
    "approvalExpiresAt": null,
    "accountableReviewer": null,
    "maxRequestsPerRun": 0
  },
  "lee_clerk_civil_suit_case_list": {
    "accessBasis": "PAID_LICENSE",
    "automationApproval": "REVIEW_REQUIRED",
    "exactUrls": [
      "https://www.leeclerk.org/services/bulk-data-services"
    ],
    "termsReviewedAt": "2026-09-01",
    "approvalExpiresAt": null,
    "accountableReviewer": null,
    "maxRequestsPerRun": 0
  },
  "lee_property_appraiser": {
    "accessBasis": "REVIEW_REQUIRED",
    "automationApproval": "REVIEW_REQUIRED",
    "exactUrls": [
      "https://www.leepa.org/Search/PropertySearch.aspx"
    ],
    "termsReviewedAt": null,
    "approvalExpiresAt": null,
    "accountableReviewer": null,
    "maxRequestsPerRun": 0
  },
  "lee_tax_collector": {
    "accessBasis": "REVIEW_REQUIRED",
    "automationApproval": "REVIEW_REQUIRED",
    "exactUrls": [
      "https://leetc.com/property-taxes/"
    ],
    "termsReviewedAt": null,
    "approvalExpiresAt": null,
    "accountableReviewer": null,
    "maxRequestsPerRun": 0
  },
  "florida_dor_property_tax_data": {
    "accessBasis": "PUBLIC_DOWNLOAD",
    "automationApproval": "APPROVED",
    "exactUrls": [
      "https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx",
      "https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip"
    ],
    "termsReviewedAt": "2026-09-01",
    "approvalExpiresAt": "2026-12-01",
    "accountableReviewer": "AcreBrief public-source review",
    "maxRequestsPerRun": 4
  },
  "lee_county_parcel_open_data_api": {
    "accessBasis": "OPEN_DATA_API",
    "automationApproval": "APPROVED",
    "exactUrls": [
      "https://gismapserver.leegov.com/gisserver910/rest/services/Locators/LeeLocator/GeocodeServer/findAddressCandidates",
      "https://gismapserver.leegov.com/gisserver910/rest/services/Layers/ParcelAddress/MapServer/0/query"
    ],
    "termsReviewedAt": "2026-09-01",
    "approvalExpiresAt": "2026-12-01",
    "accountableReviewer": "AcreBrief public-source review",
    "maxRequestsPerRun": 2
  },
  "cape_coral_open_data_utility_liens": {
    "accessBasis": "OPEN_DATA_API",
    "automationApproval": "APPROVED",
    "exactUrls": [
      "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/6/query"
    ],
    "termsReviewedAt": "2026-09-01",
    "approvalExpiresAt": "2026-12-01",
    "accountableReviewer": "AcreBrief public-source review",
    "maxRequestsPerRun": 2
  },
  "cape_coral_open_data_code_cases": {
    "accessBasis": "OPEN_DATA_API",
    "automationApproval": "APPROVED",
    "exactUrls": [
      "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5/query"
    ],
    "termsReviewedAt": "2026-09-01",
    "approvalExpiresAt": "2026-12-01",
    "accountableReviewer": "AcreBrief public-source review",
    "maxRequestsPerRun": 2
  }
} as const
