# Cape Coral property event stream

Status: implementation and live source contract verified September 1, 2026. The local/VM durable runner works; Vercel scheduling remains disabled until an approved transactional Postgres resource is attached and the SQL adapter is verified.

## Product boundary

This stream answers “what changed?” from official City-published ArcGIS Open Data. It does not scrape a website, infer a court case, infer seller intent, or turn retrieval time into event time.

```text
Code cases ────────┐
Utility liens ─────┼── exact STRAP ── snapshot/diff ── event transition
Building permits ──┤                                  │
Payoff watchlist ──┘                                  └── DOR/property investigation
```

| Layer | Production use | Clock / scan | Events | Privacy projection |
| --- | --- | --- | --- | --- |
| Code Enforcement Cases (5) | enabled adapter | six-hour lookback over `updated` or `opened`, end-bounded in City source time | `NEW_FORECLOSURE_REGISTRATION`, `CODE_VIOLATION_OPENED`, `CODE_CASE_UPDATED`, `CODE_CASE_CLOSED` | case ID/number, status/type/subtype, event clocks, STRAP, site address; exclude owner, mailing, description, updater |
| Utility Lien Data (6) | enabled adapter | event window over lien or release date; full 3.9M-row scans prohibited | `NEW_UTILITY_LIEN`, `LIEN_RELEASED`; generic amount/status changes are unsupported without an update clock or bounded reconciliation path | STRAP, lien reference/date/amount/release/status; exclude account, customer, name, confidentiality, service address |
| Building Permits (1) | enabled adapter | six-hour lookback over `lastchangedon`, end-bounded | `PERMIT_OPENED`, `PERMIT_STATUS_CHANGED`, `PERMIT_FINALIZED`, `PERMIT_EXPIRED` | permit/status/dates/value/type/work class/parcel/site components; exclude contractor and company |
| Payoff Data (2) | watchlist-only enrichment | at most 50 exact validated STRAPs; no source update clock | `MUNICIPAL_PAYOFF_CHANGED` after a prior watchlist baseline | STRAP, service category, amounts, hide marker, site/geotype; source `NAME` is never requested |
| Inspections (7) | `REVIEW_REQUIRED` | no production scan | none | identity/revision collisions and missing update clock must be resolved first; inspector/creator fields excluded |
| 311 (4) | `REVIEW_REQUIRED` | no production scan | none | filtered query returned 403; address-only resolution and free-text/confidentiality risk remain unresolved |

## Temporal contract

Four clocks stay distinct:

- `event_date`: the City’s opened/lien/release/permit event timestamp.
- `source_updated_at`: the City’s row update timestamp where the layer publishes one.
- `first_seen_at`: the first successfully committed AcreBrief observation.
- `retrieved_at` / collection time: when AcreBrief received and validated the page.

Every transition also stores `event_clock_basis` as `SOURCE_EVENT`, `SOURCE_UPDATE`, or `ACREBRIEF_DETECTION`. Retrieval time may timestamp a calculated snapshot change such as Payoff amount movement, but is never presented as the underlying government event date.

The first successful collection is a baseline and emits zero `NEW_*` events. Subsequent runs use a bounded lookback because official systems can publish late corrections. An overlapping row remains idempotent through `(source_id, native_record_key)`, a canonical state hash, and a stable transition ID. The end watermark must advance.

A delta baseline does not claim full source history. If a later update introduces a previously unseen old row, the classifier checks the row's creation timestamp against the collection window. It emits an update/closure/release transition—not `NEW_*`. Only source creation inside the window can produce a new event.

Omitted delta rows are retained. Their disappearance is never interpreted as a closure, release, or deletion. Only an explicit changed source field can produce such a transition.

## Failure and scale behavior

- Every page must return the exact requested field schema. Schema drift fails the source run before state changes.
- Pagination is stable and capped by the generated source policy. If `exceededTransferLimit` remains true at the cap, all partial records are discarded.
- Timeout, 408, 429, and 5xx failures receive bounded backoff only while physical attempts remain inside that same cap. Authorization, schema, and parse failures are never retried.
- Sources run independently. A 403, 429, timeout, malformed row, schema change, or partial page leaves that source watermark unchanged and does not prevent another source from committing.
- The local JSON store uses a restrictive file mode, token ownership, process-start fencing against PID reuse, atomic rename, generation compare-and-swap, and transition deduplication. It is for local/VM verification only.
- Production requires [`db/migrations/001_cape_coral_snapshots.sql`](../db/migrations/001_cape_coral_snapshots.sql) and a serializable SQL adapter. Vercel’s ephemeral filesystem is not a production state store.

## Verification evidence

Deterministic suites cover bootstrap suppression, bounded lookback, duplicate native records, malformed parcels, closure/release/finalization transitions, privacy-field rejection, schema drift, pagination exhaustion, source isolation, atomic file persistence, and stale-writer rejection.

The opt-in live test ran the production adapters against the official City service. It retrieved the selected Aug. 31 code-event window, retrieved the selected parcel’s payoff row without `NAME`, and established a durable three-source Code/Lien/Permit baseline. All three sources reloaded at generation 1 and the baseline emitted zero transitions.

Re-run:

```bash
RUN_LIVE_SOURCE_TESTS=1 npm test -- --run src/lib/cape-coral-events.live.test.ts
```

The live test is opt-in so ordinary CI does not repeatedly load a government service.
