# Lee Clerk Civil Suit Case List evaluation

Verified September 1, 2026. This is a purchase-boundary record, not a production authorization.

## Decision

The Lee County Clerk **Civil Suit Case List** is the best identified Lee County feed for a future `NEW_FORECLOSURE_CASE` trigger. Do not implement or production-enable it before the customer agreement, delivered sample, category codebook, delivery behavior, and intended commercial use are confirmed.

The free City of Cape Coral Open Data source now handles the immediate source-dated event demonstration as `FORECLOSURE_REGISTRATION_OPENED`. It is additive and does not change the narrower court-feed need. Promotion to `NEW_FORECLOSURE_REGISTRATION` still requires durable snapshot comparison.

## Exact product boundary

1. **Product to buy:** Lee County Clerk — Civil Suit Case List.
2. **Official URL:** <https://www.leeclerk.org/services/bulk-data-services>
3. **Price:** $180/year. The sample agreement says rates are calculated monthly, billed annually, and prorated for new customers from the month extracts begin.
4. **Agreement:** [Sample Data Extract Agreement](https://www.leeclerk.org/home/showpublisheddocument/12645/638744317069900000). It requires named authorized contacts, forbids sharing credentials, excludes sensitive/restricted information, requires notice when access is no longer needed, and requires the customer to protect confidential material inadvertently disclosed. The Clerk disclaims accuracy warranties and says extracts do not replace original records.
5. **Confirmed fields:** `CaseNbr`, `CaseCategory`, `CaseCatDescription`, `CaseStyle`, `FileDate`, `DefendantName`, `DefAddress`, `AttorneyName`, and `AttyAddress`. The [official layout](https://www.leeclerk.org/home/showpublisheddocument/11699/637841473357670000) says the product includes all new civil case details, including small claims, county civil, circuit civil, and foreclosures.
6. **Why it solves the fresh-event problem:** `CaseNbr` supplies a stable court identifier and `FileDate` supplies the filing date. `CaseCategory` plus `CaseCatDescription` are the intended classification inputs. After the actual codebook/sample proves the mortgage-foreclosure values, newly delivered rows can emit `NEW_FORECLOSURE_CASE` without scraping the public Matrix portal.
7. **Implementation after entitlement:** authenticated delivery adapter; immutable raw-file hash and control manifest; schema/codebook validation; delta/correction handling; privacy-minimal party projection; case classifier; `FileDate` event clock; delivery timestamp as `source_updated_at` when furnished; AcreBrief ingest timestamp as `retrieved_at`; durable `first_seen_at`; duplicate fingerprinting; unresolved-property queue; DOR/approved-source parcel resolution; Solari Sandbox normalization; evidence graph; adapter metrics and failure isolation.

## Confirm before signing or paying

- Exact `CaseCategory` / `CaseCatDescription` values for mortgage foreclosure, HOA/condo foreclosure, and other civil categories.
- Delivery format, channel, timezone, cadence, publication latency, first-delivery timing, and service limits.
- Whether files are delta-only, full snapshots, or both; correction, sealing, dismissal, deletion, and late-entry semantics.
- File sequence/control totals and source publication timestamps.
- Historical/backfill availability, depth, format, and price.
- Permission for automated server-side ingestion, internal retention, Solari Browser/Sandbox processing, normalized derivative facts, customer-facing property briefs, evidence display/export, and cloud subprocessors.
- Required redaction, confidentiality incident, removal, retention, and credential controls.
- Whether party addresses may be used as candidate parcel-resolution clues. `DefAddress` is not documented as the mortgaged property and must never become an exact parcel join by itself.

## Prepared official inquiry — not sent

Submit through the Clerk's [Public Records Request — Bulk Data Requests](https://www.leeclerk.org/services/public-records-request) path or ask the public Bulk Data Services team to route it. No request, agreement, purchase, or credential creation has been performed by Codex.

> We are evaluating the $180/year Civil Suit Case List for AcreBrief, a commercial property-intelligence application. Before executing the Data Extract Agreement, please confirm:
>
> 1. May we automatically ingest delivered files into our access-controlled internal cloud system?
> 2. May we sell customer reports containing normalized facts and analysis derived from the feed, provided we do not redistribute the raw Clerk dataset or credentials?
> 3. What are the delivery channel, file format, timezone, frequency, normal publication latency, and authentication method?
> 4. Are deliveries full snapshots or deltas, and how are corrections, sealed/removed records, dismissals, and late entries represented?
> 5. What historical/backfill data is available, at what depth and cost?
> 6. Which exact `CaseCategory` / `CaseCatDescription` values identify mortgage foreclosure, HOA/condo foreclosure, and other foreclosure actions? Is a current codebook and de-identified sample available before purchase?
> 7. What retention, redaction, confidentiality-incident, downstream customer-display, and cloud-subprocessor requirements apply to this use?
>
> Our intended output is a property-centered brief with case number, filing date/category, parcel-resolution status, official-source provenance, and derived prioritization. We do not intend to redistribute the raw feed or expose credentials.

## Weekly report finding

The Clerk also publishes a Foreclosure Registry Weekly Report from the bulk-data page. Its reported fields provide registry/accounting context (case number, parties, balance changes, division, report-as-of and printed dates), not the filing date or parcel/site address. It can become corroborating `FORECLOSURE_REGISTRY_BALANCE_CHANGED` evidence after case/property resolution, but it cannot emit `NEW_FORECLOSURE_CASE`.

This environment intermittently receives an Akamai 403 for the direct PDF. AcreBrief will not bypass it. The source stays research-only until ordinary scheduled download behavior is reliable.
