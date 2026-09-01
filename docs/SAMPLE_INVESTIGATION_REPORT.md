# Sample investigation brief — verified public-record fixture

**Demo status:** reproducible snapshot of two public legal notices and one Lee County permit report, retrieved August 31, 2026. It is not a live Solari run. The fixture omits owner/party names and all phone, email, and mailing-contact fields. Sale status must be refreshed against the court docket before anyone relies on it.

## Property identity

| Field | Value | Provenance / confidence |
| --- | --- | --- |
| Site | 3302 E 3rd St, Lehigh Acres, FL 33936 | May and August public legal notices; high source confidence |
| Court case | 26-CA-001793 | public legal notices; high source confidence |
| Legal description | east 1/2 of Lot 1, Block 35, Lehigh Acres Unit 9 | public legal notices; high source confidence |
| Permit-era parcel reference | 35-44-27-09-00035.001B | official Lee County May 2021 permit report |
| Parcel match | candidate / medium | address and legal description align; current Property Appraiser identifier is not asserted |

## What changed

- `NEW_FORECLOSURE_CASE`: a May 8, 2026 notice of action says a mortgage-foreclosure action exists for the property. This is the notice publication date, not an asserted case-filing date.
- `AUCTION_SCHEDULED`: an August 28, 2026 foreclosure-sale notice lists an electronic auction for September 17, 2026 at 9:00 a.m. Sale status is time-sensitive and may be postponed or cancelled.
- A May 2021 official permit report independently ties the street address to new-single-family-residence permit `RES2020-09004`; it does not prove current ownership, value, tax status, or present parcel crosswalk.

## Priority score

**46 / 100 — MEDIUM confidence** as of September 1, 2026.

- +18 newly observed auction-scheduled signal (public notice published four days earlier)
- +16 foreclosure-case signal
- +12 auction scheduled

Unknown and deliberately unscored:

- current court-docket and auction status;
- confirmed current Property Appraiser parcel identifier;
- current tax balance;
- mortgage payoff, equity, title condition, and value.

The score is a transparent triage aid, not valuation, title, equity, credit, distress, or willingness-to-sell advice.

## Evidence

1. [May 8, 2026 notice of action](https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/) — public legal notice, not a county-hosted court docket.
2. [August 28, 2026 foreclosure-sale notice](https://legals.businessobserverfl.com/news/2026/aug/28/26-03493l/) — public legal notice; contains the scheduled sale date and property description.
3. [Lee County May 2021 permit report](https://www.leegov.com/dcd/rpts/Documents/LehighPermits/2021/May/LA2021MayBPR.PDF) — official county PDF.

The live workflow checks enabled source availability and the redacted property/case markers with Solari Browser, then validates the evidence manifest in Solari Sandbox. Property-specific pages are intentionally opened in a non-recorded session because their full text contains unnecessary personal information.
