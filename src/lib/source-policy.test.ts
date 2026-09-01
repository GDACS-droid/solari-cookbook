import { describe, expect, it } from "vitest"
import { sourcePolicyAllows, sourceRequestBudget, sourceSnapshotRequestBudget } from "@/lib/source-policy"

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
    expect(sourcePolicyAllows("cape_coral_open_data_building_permits", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/1/query", new Date("2026-09-01"))).toBe(true)
    expect(sourcePolicyAllows("cape_coral_open_data_payoff", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/2/query", new Date("2026-09-01"))).toBe(true)
    expect(sourcePolicyAllows("cape_coral_open_data_inspections", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/7/query", new Date("2026-09-01"))).toBe(false)
    expect(sourcePolicyAllows("cape_coral_open_data_311", "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/4/query", new Date("2026-09-01"))).toBe(false)
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

  it("separately caps scheduled pages and keeps review-gated layers at zero", () => {
    expect(sourceSnapshotRequestBudget("cape_coral_open_data_code_cases")).toBe(4)
    expect(sourceSnapshotRequestBudget("cape_coral_open_data_utility_liens")).toBe(4)
    expect(sourceSnapshotRequestBudget("cape_coral_open_data_building_permits")).toBe(4)
    expect(sourceSnapshotRequestBudget("cape_coral_open_data_payoff")).toBe(2)
    expect(sourceSnapshotRequestBudget("cape_coral_open_data_inspections")).toBe(0)
    expect(sourceSnapshotRequestBudget("cape_coral_open_data_311")).toBe(0)
  })
})
