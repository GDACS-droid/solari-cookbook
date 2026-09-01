# Sample investigation brief — live official-data path

**Run status:** completed September 1, 2026 against current official sources with Solari Browser and Sandbox. A verified privacy-minimized replay is bundled. No owner, mailing, customer, account, phone, email, or free-text case-description fields are in this report.

## Property identity

| Field | Value | Classification / provenance |
| --- | --- | --- |
| Site | 1447 SE 17th Ter, Cape Coral, FL 33990 | source fact · Florida DOR 2026 preliminary Lee NAL |
| County parcel / STRAP | `304424C2007000560` | source fact · DOR and City Open Data |
| Legal | Cape Coral Unit 21 | source fact · DOR |
| Resolution | exact / high evidence confidence | calculated · `City.STRAPGIS === City.Main_Linked_Parcel === DOR.PARCEL_ID` |
| 2026 preliminary just value | $368,980 | source fact · DOR; not an AVM, market price, or equity estimate |
| Actual year built / living area | 2005 / 3,694 sq ft | source facts · DOR |

## Event signal and four clocks

The City of Cape Coral Code Enforcement Open Data source returned municipal case `CODE26-020878` with:

- `CaseType = FORECLOSURE REGISTRATION`;
- `CaseSubtype = REGISTERED`;
- `Status = Open`;
- source `opened = 2026-08-31T17:42:42.000Z`;
- source `updated = 2026-08-31T17:43:32.640Z`;
- exact STRAP `304424C2007000560`.

The City says the program applies when a mortgagee has initiated foreclosure and the property is vacant. This is a `FORECLOSURE_REGISTRATION_OPENED` municipal event—not the underlying court filing, judgment, or sale.

| Clock | Meaning |
| --- | --- |
| `eventDate` | official City `opened` timestamp |
| `sourceUpdatedAt` | official City `updated` timestamp |
| `firstSeenAt` | immutable first successful AcreBrief observation stored with the reviewed demo artifact |
| `retrievedAt` | completion time of the current validated source retrieval |

The current selected-record path does not have durable prior-state comparison, so it does not emit `NEW_FORECLOSURE_REGISTRATION` or say “new since last run.”

## Preliminary signal score

**32 / 100 — high evidence confidence**

- +18 recent source-dated registration event;
- +14 vacant-property foreclosure registration signal;
- +0 equity because no current payoff/equity source exists;
- +0 court/auction because those facts were not established.

Evidence confidence and opportunity magnitude are separate. “High” means the two official source records and exact native-key join support the displayed facts; it does not mean the property is a high-quality acquisition.

## Fact ledger

**Source facts:** City case type/subtype/status/opened/updated/STRAP/site address and DOR preliminary parcel/assessment/physical fields.

**Calculated:** exact native-key join, stable source-record fingerprint, transparent 32-point signal score, and evidence-manifest hashes.

**Inferred:** none promoted in the public brief.

**Unavailable:** underlying court case/filing date; tax balance/delinquency; lien priority/payoff; mortgage balances; equity; title clearance; seller behavior or willingness to sell.

## Evidence

1. [City of Cape Coral Code Enforcement Open Data layer](https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5).
2. [City abandoned/vacant property registration explanation](https://www.capecoral.gov/departments/development_services/code_compliance_division/abandoned_vacant_property.php).
3. [Florida DOR assessment-roll and GIS public-download statement](https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx).
4. [Florida DOR current 2026 preliminary Lee NAL ZIP](https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip).

Provider Browser/Sandbox identifiers exposed to the browser are one-way public run references, not raw provider handles.
