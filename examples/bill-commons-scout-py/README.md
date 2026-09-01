# Bill Commons Scout — real Solari government-browser research

This is the public, runnable browser boundary from Bill Commons Scout. It opens the
official Florida Senate page for **H 625**, clicks the **Amendments** and **Analyses**
tabs through a recorded Solari cloud browser, and returns verifiable first-party
artifacts: amendment **154926** and the Judiciary Committee bill analysis.

```bash
cd examples/bill-commons-scout-py
./setup-solari.sh                 # prompts privately; writes ignored .env.local
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python main.py --live  # one recorded, bounded Solari session
```

The output contains official URLs, a content hash, sanitized elapsed/page/action/request
counts, a non-reversible session fingerprint, replay availability, cleanup confirmation,
and a local screenshot path. It never prints the API key, session ID, browser WebSocket/
CDP URL, replay URL, cookies, or other bearer capability. A replay is deliberately not
published: its URL can be a private capability.

## Why the product uses both direct retrieval and Solari

Scout checks Bill Commons' structured corpus first and uses direct HTTP for ordinary
official HTML/PDF/RSS/API documents. It escalates to Solari only for browser interaction
or browser-oriented portals. This example demonstrates that bounded browser branch: a
real browser opens an official portal, selects two evidence tabs, captures a sanitized
screenshot, extracts the artifacts, and releases its cloud session.

The Florida Senate page can also be read with direct HTTP today; that is why the permanent
product would normally prefer HTTP for this exact URL. The live example is intentionally
browser-demonstrative rather than falsely claiming that every government page requires a
browser. It proves the same audited interaction Scout uses when a portal does require one.

## Free deterministic CI path

No network, API key, browser, or Solari credits are needed:

```bash
cd examples/bill-commons-scout-py
python3 -m unittest discover -s tests -v
python3 main.py
```

This uses a representative fixture and verifies URL admission, safe dotenv parsing,
artifact extraction, content hashing, and sanitized error reporting. Its output has
`"mechanism": "fixture"`; it is not represented as a live government result.

## Live workflow and bounds

`--live` creates exactly one recorded session and one page. It permits only HTTPS requests
to `flsenate.gov`, clicks at most three controls, permits at most 32 routed requests,
applies 10-second action and cleanup windows plus a 45-second overall work window, caps
captured HTML at 256 KiB and the screenshot at 2 MiB, and releases the remote session even
when browser navigation fails. Any cleanup uncertainty returns a sanitized failure instead
of a success claim.

The screenshot is saved locally at `artifacts/live/florida-senate-hb625.png` and ignored
by Git. Recording/replay capability is checked after release, but only the boolean
`replay_available` is output.

## Evidence returned

The command reports the canonical Florida Senate source page and immutable SHA-256 of the
captured HTML, then explicit official artifact links. The primary artifacts expected from
the current bill page are:

- Amendment 154926, with the official Senate amendment HTML URL and its page-provided
  filing detail.
- The Judiciary Committee post-meeting bill analysis, with its official PDF URL and posted
  timestamp.

Government content is untrusted data, never browser instructions. The example admits only
allowlisted official HTTPS URLs and has no facility for arbitrary user URLs or shell actions.

## Install notes

Use Python 3.11+ and obtain an API key from the Solari console. `setup-solari.sh` refuses to
write tracked or non-ignored files and never echoes the key. Environment `SOLARI_API_KEY`
takes precedence when a deployment supplies it; otherwise the program parses the local
ignored `.env.local` as plain data and does not source it.

The complete Bill Commons feature adds authenticated durable jobs, structured-data-first
routing, caching/coalescing, immutable evidence storage, partial results, browser quotas,
cancellation/leases/reaping, analytics, and an evidence-first UI.
