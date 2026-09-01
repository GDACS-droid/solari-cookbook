# Sanitized live verification

Verified on **2026-09-01** with `solari-browser==0.1.3` and the command:

```bash
.venv/bin/python main.py --live
```

Result: **pass**.

| Check | Observed result |
|---|---|
| Provider | `solari_browser` |
| Official navigation | Chapter 43 → section 43.16 |
| Extracted section | `43.16` |
| Current-law text | “One judge, or senior judge serving on a court …” |
| Official history | `s. 1, ch. 2026-141` |
| Browser runtime | 9.584 seconds |
| Pages | 1 |
| Actions | 2 |
| Routed requests | 38 of 48 maximum |
| Recording/replay capability | available |
| Remote cleanup | confirmed |

The post-hardening run produced the committed [sanitized screenshot](artifacts/live/florida-statute-43-16.png)
of the public Florida Legislature page. It contains no account data or browser controls.

The raw session identifier, connection endpoint, replay URL, cookies, and credentials
were neither printed nor retained in this proof. The replay URL is intentionally omitted
because it may be a bearer capability. The captured official HTML had SHA-256
`2e70542918802d1e9e744ea98d8e7ecfc911731cbdca1f98fcd76cc7a9bb7e3c`.

Two earlier attempts against the Florida Senate bill-category portal failed during
navigation and were released; that target also failed to commit in a local browser.
The final Online Sunshine target was selected only after the same click path succeeded
locally, and the passing Solari result above is the evidence used by this example.
The live command proves the current statute text and chapter-law history. Bill Commons'
separate structured/direct-source record supplies the HB 625-to-chapter-law association;
this browser command does not independently re-prove that mapping.
