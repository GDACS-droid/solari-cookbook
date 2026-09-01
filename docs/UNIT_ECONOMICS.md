# Unit economics and instrumentation

Pricing snapshot verified against the official [Solari pricing page](https://docs.getsolari.com/pricing) on 2026-09-01. Recheck the console before a commercial quote: rates and plan limits can change.

| Plan | Monthly fee / included credits | Browser | 1 vCPU / 2 GB Sandbox | Browser concurrency / replay retention |
| --- | --- | --- | --- | --- |
| Free | $0 / $3 | $0.15/hour | $0.086/hour | 3 / 1 day |
| Starter | $20 / $20 | $0.10/hour | $0.057/hour | 20 / 7 days |
| Professional | $200 / $200 | $0.07/hour | $0.040/hour | 150 / 30 days |

Solari says credits do not roll over, top-ups do not expire, and new resources stop launching at zero balance rather than creating an automatic overage. VMs add $0.02/hour for a live screen. AcreBrief does not enable Desktop in this slice.

## Instrument per run

| Metric | Unit | Why it matters |
| --- | --- | --- |
| `browser_session_minutes` / `browser_actions` | minutes / count | captures portal cost and selector efficiency |
| `sandbox_runtime_seconds` / `sandbox_snapshot_hit` | seconds / boolean | measures ETL cost and warm-start leverage |
| `desktop_minutes` | minutes | should normally be zero; legacy fallback is expensive |
| `source_calls` / `cache_hit_ratio` | count / percent | exposes avoidable external load |
| `records_downloaded` / `bytes_parsed` | count / bytes | limits untrusted data-processing blast radius |
| `events_emitted` / `events_deduped` | count | verifies the product is changes, not repetition |
| `run_status` / `partial_sources` | enum / count | prevents misleading completion claims |
| `estimated_provider_cost` | currency, optional | preserves quote/version used for calculation |

## Calculation model

`cost_per_investigation = browser_minutes × current_browser_rate + sandbox_seconds × current_sandbox_rate + desktop_minutes × current_desktop_rate + paid_source_cost + storage/egress`.

Report a range and pricing timestamp, not a timeless number. Also report `cost_per_100_properties`, cache ratio, and source calls so cost improvements are auditable.

## Observed live-run envelope

The successful September 1 official-data run took about **46 seconds end-to-end**: roughly four seconds for Browser launch/catalog verification and roughly 42 seconds for Sandbox creation, 43 MB download, 285 MB expansion, exact-row parse, and join validation. These are application timestamps, not provider billing records.

At Starter list rates, the compute-only estimate is approximately:

`(4/3600 × $0.10) + (42/3600 × $0.057) = $0.00078 per run`, or about **$0.08 per 100 runs** before hosting, storage, egress, retries, paid data, and minimum billing granularity.

The current competition route intentionally re-downloads the DOR archive so Solari's work is visible. Commercial scale should cache by DOR URL + ETag/Last-Modified and batch many parcel lookups in one Sandbox. That changes the unit from “one 43 MB download per property” to “one source revision per county plus cheap indexed lookups.”

## Earlier conservative envelope

At Starter rates, a deliberately conservative one-property run budget of **four Browser minutes plus one minute of a 1 vCPU / 2 GB Sandbox** is:

`(4/60 × $0.10) + (1/60 × $0.057) = $0.00762`, or roughly **$0.76 per 100 investigations** before paid data, proxies, storage, hosting, retries, and idle time. A one-session property-only journey would be lower; a slow/gated source or unclosed session would be higher.

The real live run still did not persist provider billing telemetry. Production must record provider-confirmed session/Sandbox duration, source coverage, archive revision/cache hits, bytes, and pricing version per run.

## Engineering controls

Reuse one short, source-scoped Browser session for related properties; prefer contracted bulk files for detection; cache immutable instrument references; batch Sandbox parse jobs; stop after access/rate-limit warnings; and never launch Desktop merely for visual theater.
