import { describe, expect, it } from "vitest"
import { sourcePolicyAllows, sourceRequestBudget } from "@/lib/source-policy"

describe("generated runtime source policy", () => {
  it("keeps every current runtime source fail-closed", () => {
    expect(sourcePolicyAllows("lee_business_observer_legal_notices", "https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/")).toBe(false)
    expect(sourcePolicyAllows("lee_clerk_court_records", "https://matrix.leeclerk.org/home/index")).toBe(false)
    expect(sourcePolicyAllows("lee_property_appraiser", "https://www.leepa.org/Search/PropertySearch.aspx")).toBe(false)
    expect(sourcePolicyAllows("lee_tax_collector", "https://leetc.com/property-taxes/")).toBe(false)
  })

  it("exposes a zero request budget for review-required sources", () => {
    expect(sourceRequestBudget("lee_business_observer_legal_notices")).toBe(0)
  })
})
