# Southwest Florida source matrix

Last desk-reconnaissance: 2026-09-01. “Public search” means the entry point was observed, **not** that scraping is authorized. Machine-readable details, source IDs, and unknowns are in [`data/source_registry.yaml`](../data/source_registry.yaml).

| Geography | Source | Useful signals | Preferred path | Status / caveat |
| --- | --- | --- | --- | --- |
| Lee | Business Observer legal notices | Published notice-of-action and foreclosure-sale signals | Exact public artifact; corroborate against court docket | Redacted verified fixture only; it is not a government docket and live automation stays default-deny pending terms review |
| Lee | Clerk official records | Lis pendens, deeds, mortgages, liens, satisfactions, assignments | Clerk bulk subscription, then lawful portal | Public search and paid daily images/indices observed; automation terms require review |
| Lee | Clerk court inquiry / foreclosure registry | Circuit civil filings, foreclosure calendars/registry | Weekly registry/report; court portal | Public access observed; case/docs access level and automation need gating |
| Lee | Clerk foreclosure & tax-deed sales | Scheduled/cancelled sales, tax deed sale signals | Official sale/calendar path | Public page observed; exact feed/API not yet verified |
| Lee | Property Appraiser / GeoView | STRAP, site/mailing address, legal, assessed data, sales, building/GIS | Official property/GIS lookup | Public search/GIS observed; maps/aerials cannot be commercially redistributed |
| Lee | Tax Collector | Delinquency / certificates / tax payment status | Official source when a documented lookup/export is confirmed | Candidate only; live adapter not represented as complete |
| Lee | County code enforcement / permits | Open/closed violations, unsafe structures, permit status | Official open-data/API when identified | Reconnaissance pending; no automation claim |
| Charlotte | Clerk / official records | Recorded docs, liens, deeds, mortgages, lis pendens | Official index/bulk if approved | Official responsibility confirmed; portal details must be reverified |
| Charlotte | Property Appraiser | Parcel/folio, values, ownership, characteristics | Official property/GIS lookup | Candidate; endpoint/terms review needed |
| Charlotte | Tax Collector / LienHub | Delinquent tax certificate & tax deed signals, lands available | Tax Collector / declared auction provider | Tax collector directs users to LienHub; commercial/third-party terms need review |
| Charlotte | Clerk tax-deed sale | Scheduled sale / cancellation | Official clerk sale system | Candidate; required adapter reconnaissance |
| Collier | Clerk COR Public Access | Official land records: instruments, legal, parties, map search | Official portal | Public index observed; disclaimer says website use is personal-information only—automation is review-required |
| Collier | Clerk tax deed sales | Tax-deed application notice, upcoming sale | Clerk’s list/search | Public notices observed; not a title search |
| Collier | Property Appraiser | Parcel, values, property/GIS | Official property appraiser | Public website observed; endpoint/terms review needed |
| Collier | Growth Management CityView | Permits, status, zoning-related records | Official municipal service | Officially identified by county; data interface not yet verified |
| Florida | DOR Property Tax Oversight | Assessment roll NAL/NAP/SDF and GIS, historical requests | Published download/request | Official bulk exists; public files omit confidential records and refresh on stated schedule |
| Florida | Division of Corporations (Sunbiz) | Entity status, entity document number, officer/registered agent records | Public entity lookup | Use only to resolve a property-owning entity; do not create people dossiers |
| Florida | Court record framework | Access-matrix/legal handling rules | County source of record first | AOSC24-65 requires public replicated/redacted record treatment; bulk transfer is monitored |
| Federal | FEMA Flood Map Service Center / GIS | Flood zone/reference and disaster declaration context | Official map/API service | Geographic risk context, not a property-condition conclusion |
| Commercial research only | ATTOM, Regrid, BatchData, AVM/equity vendors | Licensed enrichments, parcel crosswalks, AVM/mortgage signals | Paid licensed API after procurement | Not bundled, not a source of truth, credentials/terms required |

## Lee vertical slice evidence

**Observed:** Lee Clerk advertises a paid daily images/indices/plat download option and paid official-record/court extracts; the public court inquiry has capped search results and access-level-dependent documents. The Appraiser offers STRAP/folio/address/owner and recording lookups and GeoView parcel mapping. Florida’s court access order governs public access via replicated/redacted records and says automated bulk transfers are monitored.

**Design inference:** use the Clerk’s documented bulk/report route for detection when procured; use a limited, allow-listed Solari Browser journey for the demonstrable portal investigation only after per-source approval. Resolve to a `county:parcel` identity, retain `case_number`/`instrument_number`, and attach source URLs—not broad party searches.

**Unknowns / gates:** current automated-use allowance, robots directives, practical rate limit, exact subscription agreement, and any authentication flow. Registry fields preserve these as unknown rather than silently green-lighting them.
