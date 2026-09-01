# Sample investigation brief — live official-data path

**Run status:** completed September 1, 2026 against current official sources with Solari Browser and Sandbox. A verified privacy-minimized replay is bundled for repeatability. No owner, mailing, customer, account, phone, or email fields are in this report.

## Property identity

| Field | Value | Classification / provenance |
| --- | --- | --- |
| Site | 413 SW 26th Ave, Cape Coral, FL 33991 | source fact · Florida DOR 2026 preliminary Lee NAL |
| County parcel / STRAP | `174423C3039260170` | source fact · DOR and City Open Data |
| Legal | Cape Coral Unit 54 | source fact · DOR |
| Resolution | exact / HIGH | calculated · `trim(City.Strap) === DOR.PARCEL_ID` |
| 2026 preliminary just value | $238,922 | source fact · DOR; not an AVM, market price, or equity estimate |
| Actual year built / living area | 2005 / 2,545 sq ft | source facts · DOR |

## Event signal

The City of Cape Coral Utility Lien Open Data source returned the selected record with:

- `Active_Lien = Y` at live retrieval;
- source lien date February 25, 2022;
- no source release date;
- the same STRAP as the DOR record.

This is a **current source-status check for a historic municipal-lien row**, not a claim that a lien was created today. The City's table contains no active lien dated in 2026; its latest active source date is July 14, 2022.

## Priority score

**10 / 100 — HIGH evidence confidence**

- +10 recorded-lien signal;
- +0 recency because the source event date is 2022;
- +0 equity because no current payoff/equity source exists;
- +0 foreclosure/auction because those sources were not part of this approved run.

Evidence confidence and opportunity magnitude are deliberately separate. “HIGH” means the two official sources and exact join support the displayed facts; it does not mean the property is a high-quality acquisition.

## Fact ledger

**Source facts**

- DOR 2026 preliminary parcel/assessment/physical fields listed above;
- City source currently reports the selected utility-lien row active;
- source lien date and no release date in that selected record.

**Calculated**

- exact trimmed native-key join;
- stable event fingerprint using parcel, lien reference, event date, amount, active state, and release state;
- transparent ten-point lien score;
- archive/evidence manifest hashes.

**Inferred**

- none promoted in the public brief.

**Unavailable**

- current foreclosure, court, and auction status;
- current tax balance/delinquency;
- lien priority, legal enforceability, and payoff;
- mortgage balances, equity, title clearance;
- owner behavior or willingness to sell.

## Evidence

1. [Florida DOR assessment-roll and GIS public-download statement](https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx).
2. [Florida DOR current 2026 preliminary Lee NAL ZIP](https://www.floridarevenue.com/property/dataportal/Documents/PTO%20Data%20Portal/Tax%20Roll%20Data%20Files/NAL/2026P/Lee%2046%20Preliminary%20NAL%202026.zip).
3. [City of Cape Coral Utility Lien Open Data layer](https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/6).

The live Sandbox archive checksum observed during the successful run was retained in run evidence. Provider session and Sandbox identifiers exposed to the browser are irreversible 12-character hashes, not raw provider handles.
