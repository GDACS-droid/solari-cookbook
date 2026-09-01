# Fresh official event source

## Live-ready signal

City of Cape Coral Open Data publishes a Code Enforcement Cases table at:

- Service: <https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer>
- Layer: <https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5>
- Query API: <https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5/query>
- Access basis: `OPEN_DATA_API`

The City describes the service as Open Data for mapping, analysis, and planning. Its [abandoned and vacant property page](https://www.capecoral.gov/departments/development_services/code_compliance_division/abandoned_vacant_property.php) says a mortgagee must register a vacant property after initiating foreclosure. The dataset is evidence of that **municipal registration**, not evidence of the underlying court filing, judgment, or sale.

## Privacy-minimal schema

AcreBrief requests only:

`CMCODECASEID`, `CaseNumber`, `Status`, `opened`, `closed`, `updated`, `CaseType`, `CaseSubtype`, `Main_Linked_Parcel`, `STRAPGIS`, `SiteAddressGIS`, city/state/ZIP.

It excludes owner, mailing, contact, and free-text description fields. ArcGIS marks `ESRI_OID` as hash-valued, so AcreBrief deliberately excludes it from identity; `CMCODECASEID` is the stable native record key.

## Verified current result

On September 1, 2026, an official bounded query found five `FORECLOSURE REGISTRATION` rows source-opened August 31. The selected privacy-safe property record is:

| Field | Value | Classification |
| --- | --- | --- |
| Municipal case | `CODE26-020878` | source fact |
| Native record ID | `d07a6590-aa57-4739-a755-e4b72128b335` | source fact |
| Parcel / STRAP | `304424C2007000560` | source fact |
| Source event | `2026-08-31T17:42:42.000Z` | source fact (`opened`) |
| Source updated | `2026-08-31T17:43:32.640Z` | source fact (`updated`) |
| First seen | `2026-09-01T15:11:48.000Z` | AcreBrief observation |
| Retrieved | per live run | AcreBrief observation |
| DOR site | `1447 SE 17TH TER, CAPE CORAL, FL 33990` | source fact |
| Join | City STRAP equals DOR `PARCEL_ID` | calculation |

The static brief says **SOURCE-DATED AUG 31** for this record and **LIVE VERIFIED RESULT** for a successful current retrieval. It does not say `NEW_TODAY`, `NEW SINCE LAST RUN`, or `NEW_FORECLOSURE_CASE`.

## Event contract

```text
event_type       FORECLOSURE_REGISTRATION_OPENED
event_date       official City opened timestamp
source_updated_at official City updated timestamp
first_seen_at    first successful AcreBrief observation
retrieved_at     current investigation retrieval time
source_record_id CMCODECASEID
property match   exact STRAPGIS == Main_Linked_Parcel == DOR PARCEL_ID
```

The first-seen value for the reviewed demo record is stored in `src/data/event_observations/official_demo_observations.json` and is not rewritten by repeat investigations. It lives under `src/` because it is a bounded runtime input; the repository's larger research `data/` tree remains excluded from Vercel deployment. Current retrieval time is captured only after the official City response validates. An old row retrieved today remains live-verified but not fresh. `NEW_FORECLOSURE_REGISTRATION` and “new since last run” remain reserved for a durable successful snapshot diff; the current selected-record path does not claim that diff exists. `source_updated_at` is unavailable where the source does not publish it and is never inferred from HTTP retrieval time.
