# Bill Commons Scout — live Solari research on official Florida law

The headline command launches a real, recorded Solari cloud browser. It opens the
Florida Legislature's Online Sunshine portal at chapter 43, clicks **43.16**, and
verifies the enacted Justice Administrative Commission language plus its official
history entry, **s. 1, ch. 2026-141**. The Bill Commons Scout demo uses this as a
current-law cross-check in its separately evidenced HB 625 case file.

```bash
cd examples/bill-commons-scout-py
./setup-solari.sh                 # hidden prompt; writes ignored .env.local
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python main.py --live  # one bounded, recorded Solari session
```

Successful output includes the exact official statute URL, extracted current-law
language, a content hash, bounded runtime/page/action/request counts, replay
availability, cleanup confirmation, and local before/after screenshot paths. It never prints
the API key, session ID, WebSocket/CDP endpoint, replay URL, cookies, or another
bearer capability. The repository includes the [sanitized passing run](LIVE_PROOF.md)
and its public-page screenshot.

## Architecture: cheap sources first, browser when useful

Bill Commons Scout checks the structured Bill Commons corpus first. It then uses
direct HTTP for ordinary official HTML, PDFs, RSS, and APIs. It invokes Solari only
when browser navigation is required or is the product capability under test.

For this Florida case, native Scout uses direct HTTP to discover HB 625's official
amendment and staff-analysis documents. The public live example then demonstrates
the bounded browser branch on the same research file: it navigates the official
Florida statute portal and verifies current text plus its chapter-law history. The
browser command does not independently prove the HB 625-to-chapter-law mapping; that
association comes from Scout's separate structured/direct-source record. It also does
not pretend direct HTTP is impossible. It proves that Harry can clone the example,
run one command, and see a real government-browser lifecycle.

## Free deterministic CI path

No network, API key, browser, or Solari credits are needed:

```bash
cd examples/bill-commons-scout-py
python3 -m unittest discover -s tests -v
python3 main.py
```

This fixture verifies the same extraction contract for §43.16, including the judge
membership language and 2026 chapter-law history. Its output is explicitly labeled
`"mechanism": "fixture"`; it is never represented as live research.

## Live workflow and safety bounds

`--live` creates one recorded session and one page. The browser performs two bounded
actions: open chapter 43, then follow the exact `43.16` link. It admits only HTTPS
requests to `leg.state.fl.us`, permits at most 48 routed requests, applies 10-second
action and cleanup windows plus a 45-second total work window, caps captured HTML at
256 KiB and the screenshot at 2 MiB, and releases the paid remote session before
local browser teardown. Cleanup uncertainty is a failure, never a success claim.

The same live session saves a chapter-contents frame at
`artifacts/live/florida-statutes-chapter-43.png` and the final section frame at
`artifacts/live/florida-statute-43-16.png`. Generated live artifacts are ignored by Git;
the two reviewed proof frames are deliberately committed. Recording/replay
capability is checked after release, but output exposes only a boolean. Replay URLs
are not published because they may be private capabilities.

## Evidence contract

Success requires all of the following on the final official page:

- section number `43.16`;
- the Justice Administrative Commission catchline;
- the paragraph beginning “One judge, or senior judge serving on a court”;
- a history entry containing `s. 1, ch. 2026-141`.

The command reports the canonical official source and a SHA-256 hash of captured HTML.
Government content is untrusted data, never browser instructions. There is no arbitrary
URL input, shell action, or cross-origin navigation facility.

## Install notes

Use Python 3.11+ and obtain an API key from the Solari console. `setup-solari.sh`
refuses to write tracked or non-ignored files and never echoes the key. Environment
`SOLARI_API_KEY` takes precedence when a deployment supplies it; otherwise the program
parses local ignored `.env.local` as literal data and never sources it.

The permanent Bill Commons feature adds authenticated durable jobs,
structured-data-first routing, caching/coalescing, immutable evidence storage,
partial results, browser quotas, cancellation/leases/reaping, analytics, and an
evidence-first UI.
