# 80-second live demo script

**0–10s — pain.** “Acquisition teams lose hours bouncing among municipal, property, tax, and court systems before they know whether one signal deserves another hour.”

**10–20s — source-dated queue.** Show the Cape Coral brief. “Cape Coral published five foreclosure registrations source-opened August 31. AcreBrief selected one with a stable municipal case ID and an exact parcel. This is a municipal registration—not a court filing and not a claim that a snapshot diff happened today.”

**20–40s — press one button.** Click **Investigate this property live**. “Solari Browser verifies Florida DOR’s official public-data catalog. Solari Sandbox downloads and opens the current 43-megabyte Lee assessment roll, validates the archive and 165-column schema, and emits one privacy-minimized parcel.”

Let the four truthful rows complete:

1. Florida DOR catalog — Solari Browser;
2. DOR 2026 Lee NAL — Solari Sandbox;
3. Cape Coral Foreclosure Registration — direct official Open Data API;
4. exact parcel join + evidence manifest — Solari Sandbox.

**40–55s — result.** “The City STRAP and DOR PARCEL_ID match exactly. The City row retains its August 31 opened time and updated time; AcreBrief separately retains first-seen and current retrieval. A successful rerun says LIVE VERIFIED, never fresh merely because it ran now.”

**55–70s — explainability.** Show score 32. “The preliminary signal score earns 18 points for a recent source event and 14 for a vacant-property foreclosure registration. High means evidence confidence—not acquisition quality. Court filing, tax balance, lien priority, payoff, equity, title, and seller intent remain unavailable.”

**70–80s — differentiation.** Open the evidence ledger and source operations. “One agent, fragmented government systems, exact parcel resolution, four clocks, and evidence attached. The $180 Lee Clerk feed is the next court-filing trigger once its agreement and codebook are confirmed.”

## Recording checklist

- Record `acrebrief.com` from a clean browser; confirm no dev toolbar or browser extension overlay appears.
- Wait out the public cooldown rather than substituting replay footage.
- Do not show `.env`, provider IDs, raw Solari session IDs, browser profiles, source cookies, owner/mailing/contact fields, or unreviewed court content.
- If City or DOR fails, show the fail-closed state. Use the verified replay only with its visible replay label.
- Do not say “new today” or “new since last run” for the selected August 31 record. Say “source-dated August 31.”
- Do not claim the municipal registration is the underlying court case.
- Use one continuous 60–90 second take; no fabricated pilots, testimonials, counters, or source freshness.
