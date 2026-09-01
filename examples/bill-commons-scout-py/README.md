# Bill Commons Scout (Python)

Bill Commons Scout is an evidence-first government-research agent. The permanent product checks Bill Commons' structured legislative database and ordinary HTTP first, then uses a recorded Solari browser only when an allowlisted official portal genuinely requires browser interaction.

This public cookbook example isolates that paid-browser boundary behind `ResearchBrowserProvider`. It retains the exact fetched bytes' SHA-256, an evidence excerpt, retrieval mechanism, runtime, a non-reversible session fingerprint, and replay availability. Signed session capabilities and replay bearer URLs are never printed. Retrieved page text is treated as untrusted data, never as instructions.

## Free deterministic run

No key, network access, or browser credits:

```bash
cd examples/bill-commons-scout-py
python main.py
```

The output is visibly fixture-backed. It proves the evidence contract without claiming a live government finding.

## Explicit live smoke

```bash
cd examples/bill-commons-scout-py
python -m venv .venv
.venv/bin/pip install -r requirements.txt
export SOLARI_API_KEY=...   # never commit or print this value
.venv/bin/python main.py --live
```

The live path creates exactly one recorded session, visits only the allowlisted Florida Online Sunshine robots policy, verifies its deterministic `User-agent` marker, blocks off-domain browser requests, caps runtime and response bytes, records the provider ID before browser connection, releases the session outside the navigation timeout, and polls replay availability for a bounded interval. Replay upload may still be pending when the command completes; retained official-source content remains the primary evidence.

The native Bill Commons live gate passed this path on September 1, 2026: one page/action, 3.65 seconds, deterministic marker present, replay available, and cleanup confirmed. This public example then passed independently in 4.935 seconds with session fingerprint `6ec77bde219c`, content SHA-256 `2eea2058576ce8bf11c5f93d987ee2d6eb44e046aef4e0904f57cddfc2b387a1`, replay available, and cleanup complete. A separate Florida Senate host reset the cloud-browser connection even though direct HTTP was healthy; Scout retains that as a partial source failure rather than turning it into a finding.

The full native Bill Commons feature adds authenticated durable jobs, structured-data-first routing, direct retrieval, caching/coalescing, immutable RawStore evidence, partial results, browser concurrency quotas, cancellation/leases/reaping, analytics, and a responsive evidence UI.

## Why Solari is useful here

Legislative databases cover normalized bills well, but government agendas, amendments, fiscal notes, hearings, notices, and older JS-heavy portals are scattered across browser-oriented sites. Solari supplies an auditable cloud browser for the narrow portion ordinary HTTP cannot reliably reach; it is a fallback, not the product's default fetcher or a demo gimmick.
