# 80-second live demo script

**0–10s — pain.** “Acquisition teams lose hours bouncing among municipal, property, tax, and court systems before they know whether one signal deserves another hour.”

**10–20s — honest queue.** Show the Cape Coral brief. “This City source currently marks a municipal utility-lien row active. The source event date is 2022, so AcreBrief does not call it new today. What is live is the official status check and the property investigation.”

**20–40s — press one button.** Click **Investigate live**. “AcreBrief goes to Florida DOR first. Solari Browser verifies the official public-data catalog. Solari Sandbox downloads and opens the current 43-megabyte Lee assessment roll, scans 165 columns, and emits only one privacy-minimized parcel.”

Let the four rows turn green:

1. Florida DOR catalog — Solari Browser;
2. DOR 2026 Lee NAL — Solari Sandbox;
3. Cape Coral Utility Lien Open Data — direct official API;
4. exact parcel join + evidence manifest — Solari Sandbox.

**40–55s — result.** “The City STRAP and DOR PARCEL_ID match exactly. This is a real 2026 preliminary DOR record with the source URL, retrieval time, archive hash, and City evidence attached. No owner, customer, account, mailing, phone, or email data is collected.”

**55–70s — explainability.** Show score 10. “The score earns ten points for a recorded-lien signal—nothing for fake recency or guessed equity. Court status, lien priority, payoff, taxes, title, and seller intent remain unavailable.”

**70–80s — differentiation.** Show Evidence and Operations, then the pilot CTA. “One agent, fragmented government systems, exact parcel resolution, and evidence attached. This is the first live slice; an affirmatively licensed fresh foreclosure feed is next.”

## Recording checklist

- Record the deployed production domain from a clean browser.
- Ensure the public live cooldown is clear if a prior run occurred; wait one minute rather than substituting replay footage.
- Do not show `.env`, provider IDs, raw Solari session IDs, browser profiles, source cookies, owner/customer/account fields, or unreviewed court content.
- If the City or DOR source fails, show the failure honestly; use the verified official-data replay only with its visible replay label.
- Use one continuous 60–90 second take; no fabricated metrics, pilots, testimonials, or source freshness.
