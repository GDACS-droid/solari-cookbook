import { describe, expect, it } from "vitest"
import { sourcePolicyAllows, sourceRequestBudget } from "@/lib/source-policy"

describe("generated runtime source policy", () => {
  it("keeps review-required runtime sources fail-closed", () => {
    expect(sourcePolicyAllows("lee_business_observer_legal_notices", "https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/")).toBe(false)
    expect(sourcePolicyAllows("lee_clerk_court_records", "https://matrix.leeclerk.org/home/index")).toBe(false)
    expect(sourcePolicyAllows("lee_property_appraiser", "https://www.leepa.org/Search/PropertySearch.aspx")).toBe(false)
    expect(sourcePolicyAllows("lee_tax_collector", "https://leetc.com/property-taxes/")).toBe(false)
  })

  it("allows only the exact reviewed official download and Open Data endpoints", () => {
    expect(sourcePolicyAllows("florida_dor_property_tax_data", "https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx", new Date("2026-09-01"))).toBe(true)
    expect(sourcePolicyAllows("cape_coral_open_data_utility_liens", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/6/query", new Date("2026-09-01"))).toBe(true)
    expect(sourcePolicyAllows("cape_coral_open_data_code_cases", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5/query", new Date("2026-09-01"))).toBe(true)
    expect(sourcePolicyAllows("cape_coral_open_data_utility_liens", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5/query", new Date("2026-09-01"))).toBe(false)
  })

  it("exposes a zero request budget for review-required sources", () => {
    expect(sourceRequestBudget("lee_business_observer_legal_notices")).toBe(0)
  })

  it("budgets every worst-case physical attempt in the official live chain", () => {
    expect(sourceRequestBudget("florida_dor_property_tax_data")).toBe(4)
    expect(sourceRequestBudget("cape_coral_open_data_utility_liens")).toBe(2)
    expect(sourceRequestBudget("cape_coral_open_data_code_cases")).toBe(2)
  })
})
