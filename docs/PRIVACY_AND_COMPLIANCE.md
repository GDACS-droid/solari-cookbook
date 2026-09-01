# Privacy and compliance posture

## Product boundary

AcreBrief is **public-record property intelligence** and acquisition decision support. The core unit is a parcel/property and its event graph. It is not framed or operated as “OSINT on people,” a credit/tenant-screening product, a title opinion, or an outreach engine.

## Demonstration rules

- Redact or avoid personal phone numbers, email addresses, account numbers, signatures, and unnecessary party details.
- Do not expose contact enrichment in a public demo; use synthetic fields only when a UI needs a demonstration value and label them as synthetic.
- Do not reproduce Lee Property Appraiser aerial/map imagery: its policy allows public personal/non-business use but prohibits commercial redistribution. Link facts to their source; do not ship a map/aerial panel or screenshots containing that imagery.
- Preserve source fact versus derived inference. A score means priority to investigate, never owner willingness, legal title, financial condition, or an offer recommendation.
- Do not use CAPTCHAs, credential sharing, stealth to evade a site rule, or high-volume browsing to defeat source controls.
- Recordings and screenshots are evidence artifacts, not automatically public media. Redact/review them before any sharing.

## Court and public-record safeguards

Florida court public web access is governed by the Florida Supreme Court access framework. AOSC24-65 describes replicated/redacted public web records and monitoring of automated bulk transfers. AcreBrief must use the county’s source-of-record and approved/bulk path where applicable, respect access levels, retain less data where sufficient, and stop if a source flags/restricts automation.

Florida public-record law supports access subject to exemptions; it does not grant an unrestricted right to reuse, republish, or mass-automate every portal. Florida Statutes section 28.2221 also governs clerk record processing/redaction responsibilities. Legal counsel should approve production source agreements, data retention, user terms, consent flow, and jurisdiction expansion.

## Data lifecycle

| Data class | Storage | Access / retention |
| --- | --- | --- |
| Public normalized property/event fact | graph with source URL, retrieval time, adapter version | retention based on source/license and product need |
| Raw evidence / permitted download | restricted artifact store, checksum, provenance | access controlled; delete/refresh when source terms require |
| Browser profile/cookie | Solari provider secret store only | explicit authorization; no logs, exports, or commits; delete on purpose end |
| Recording/screenshot | restricted by default | review/redact before any external exposure |
| Pilot request | limited CRM/contact system | consent purpose; deletion request path |

## Required review gates

1. Source-specific terms, robots/rate limits, contract, and technical access approval.
2. A privacy/redaction check before adding a demo artifact.
3. Licensed-provider review before AVM, mortgage, equity, or contact enrichment is enabled.
4. Counsel review before public launch, data resale, or communication automation.

Primary materials: [AOSC24-65](https://supremecourt.flcourts.gov/content/download/2440532/file/AOSC24-65.pdf), [Fla. Stat. §119.07](https://www.leg.state.fl.us/STATUTES/index.cfm?App_mode=Display_Statute&URL=0100-0199%2F0119%2FSections%2F0119.07.html), [Fla. Stat. §28.2221](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099%2F0028%2FSections%2F0028.2221.html), and [Lee PA privacy policy](https://www.leepa.org/PrivacyPolicy.aspx).
