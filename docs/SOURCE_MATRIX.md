# Southwest Florida source matrix

Last verified: 2026-09-01. The machine-readable authority is [`data/source_registry.yaml`](../data/source_registry.yaml). “Public search” is not automation permission; only `PUBLIC_DOWNLOAD`, `OPEN_DATA_API`, `PAID_LICENSE`, or `EXPRESS_PERMISSION` can be production-enabled.

## LIVE_READY official chain

| Geography | Source | Basis | Current artifact/API | Product job | Guardrail |
| --- | --- | --- | --- | --- | --- |
| Florida / Lee | Florida DOR Property Tax Oversight | `PUBLIC_DOWNLOAD` | `Lee 46 Preliminary NAL 2026.zip`, 43,316,780 compressed bytes, modified 2026-07-27 | current parcel ID, situs, legal, 2026 preliminary assessment and physical facts | Sandbox size/schema validation; omit owner/mailing; preliminary roll is not current tax status or an AVM |
| Cape Coral / Lee | City Open Data Utility Lien Data | `OPEN_DATA_API` | ArcGIS `OpenData/OpenData/MapServer/6/query` | source-reported active lien status, lien date/reference/amount, STRAP | one exact record; exclude account/customer/name/address fields; historic source date is not “new today” |
| Lee | County Parcel Address + Locator REST | `OPEN_DATA_API` | official ArcGIS REST locator and parcel query | independent address→STRAP→folio resolution and property facts | exact/privacy-minimized fields only; no aerial imagery; two-request budget |
| Lee | Property Appraiser free tax-roll downloads | `PUBLIC_DOWNLOAD` | 2026 preliminary county NAL ZIP | county-published bulk backstop | cache by revision; project property facts only; no map/aerial redistribution |

### Verified live result

The production adapter executed this chain on September 1, 2026:

```text
Solari Browser → official DOR public-data catalog
Solari Sandbox → DOR 2026 Lee NAL ZIP → exact PARCEL_ID projection
City Open Data → one exact utility-lien row
Solari Sandbox → trim(City.Strap) === DOR.PARCEL_ID → evidence manifest
```

For the public demo parcel, the DOR archive produced one 2026 preliminary record and the City source returned one selected row with `Active_Lien=Y`. The source lien date is February 25, 2022. This is a live status/enrichment path, not a fresh 2026 foreclosure detector.

## Review-required and research sources

| Geography | Source | Potential signals | Basis/status | Cleaner route being pursued |
| --- | --- | --- | --- | --- |
| Lee | Business Observer legal notices | publication notices | `REVIEW_REQUIRED`; removed from critical live path | licensed feed or official Clerk bulk/event source |
| Lee | Clerk official records | lis pendens, deed, mortgage, lien, satisfaction | `REVIEW_REQUIRED`; paid daily images/indices and extracts advertised | procure/review bulk agreement |
| Lee | Clerk court inquiry | foreclosure case/docket/calendar | `REVIEW_REQUIRED` | official paid civil/comprehensive extracts or express API permission |
| Lee | Clerk foreclosure/tax deed sales | schedule/cancel/postpone/title | `REVIEW_REQUIRED` | documented official feed/download or express permission |
| Lee | Property Appraiser interactive search / GeoView | parcel, assessment, sales, GIS | interactive path `REVIEW_REQUIRED`; free bulk/API alternatives are enabled | DOR/Lee free NAL and County ArcGIS API |
| Lee | Tax Collector | tax balances/certificates/deeds | `REVIEW_REQUIRED` | documented public report/download or licensed feed |
| Lee | County code/permits | code and permit events | `REVIEW_REQUIRED` pending exact interface | official Lee/Cape Coral open-data layer with tested freshness |
| Charlotte | Clerk / Appraiser / Tax Collector-LienHub | records, parcel, tax distress | `REVIEW_REQUIRED`; third-party terms unresolved | official bulk/open-data or paid reviewed license |
| Collier | Clerk COR / tax deed / Appraiser / CityView | records, tax deed, parcel, permits | `REVIEW_REQUIRED` | official bulk/open-data or express permission |
| Florida | Sunbiz | property-owning entity resolution | `REVIEW_REQUIRED` | narrowly scoped official/express route; never people dossiers |
| Florida | Court access order AOSC24-65 | compliance rules | `PUBLIC_DOWNLOAD`; policy evidence, not an event adapter | apply to county court-access design |
| Federal | FEMA MSC/GIS | flood context | `REVIEW_REQUIRED` until exact API route/policy is recorded | official GIS API |
| Commercial | ATTOM / Regrid / BatchData equivalents | licensed AVM, mortgage, owner/contact enrichment | `PAID_LICENSE`; not procured | separate compliance-reviewed commercial module |

## Source-fact discipline

- **Source fact:** exact value returned by DOR or City Open Data with URL, retrieval time, effective date, archive/API record identity, and adapter version.
- **Calculated:** exact whitespace-trimmed STRAP/PARCEL_ID join, normalization, hash, score component, or snapshot diff.
- **Inferred:** never promoted without a rule and confidence; the current live brief makes no behavioral inference.
- **Unavailable:** foreclosure status, current court/auction status, tax balance, lien priority/payoff, mortgage balance, equity, title clearance, and willingness to sell.

## Operational findings

The City table's latest active lien date is July 14, 2022; it is valuable current-status enrichment but cannot answer “what new lien appeared today?” The next event-detector milestone is a clearly licensed/official feed with 2026 creation/update timestamps and stable parcel identifiers. Broken or blocked sources remain visible as degraded and never silently substitute fixture facts.
