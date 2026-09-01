# Competition launch package — approval required

These assets are ready to publish. Do **not** post, DM, tag accounts, or imply endorsement until the account owner explicitly approves the exact external action. Upload [`assets/demo/acrebrief-demo.mp4`](../assets/demo/acrebrief-demo.mp4) as native media; its first frame is the AcreBrief interface, not terminal output.

## X — primary post

Attach the 60.64-second demo video to this post:

> Built AcreBrief for the @getsolari challenge: live SWFL property intelligence—not a static lead list.
>
> Solari Browser + Sandbox verify approved government data, resolve a parcel, and return evidence + unknowns.
>
> acrebrief.com
> github.com/GDACS-droid/solari-cookbook
> @harrychow_

## X — first reply

> The live path is real: Solari Browser verifies Florida DOR, Sandbox retrieves and parses the current Lee assessment roll, Cape Coral Open Data supplies a source-dated municipal registration, and Sandbox proves the exact STRAP-to-parcel join.
>
> No owner/contact enrichment. No silent fallback to mock data.

## X — second reply

> The distinction I care about: a municipal registration is not a court filing, title result, or proof someone wants to sell. AcreBrief keeps event time, first-seen time, retrieval time, evidence, calculations, and unknowns separate.
>
> Cape Coral source monitor: acrebrief.com/florida/cape-coral/property-distress

## LinkedIn

> Acquisition teams can find a distressed-property signal. The expensive part is deciding whether it deserves another hour across property, municipal, clerk, court, tax, and title systems.
>
> I built **AcreBrief** for the Solari challenge: an evidence-first property-intelligence product for Southwest Florida.
>
> In the live demo, Solari Browser verifies Florida's official property-data catalog. Solari Sandbox downloads and safely parses the current Lee County assessment roll, emits one privacy-minimized parcel, validates the evidence manifest, and proves an exact cross-source parcel join. Cape Coral's official Open Data provides the source-dated municipal event.
>
> The result is a property brief that distinguishes source facts, calculations, inferences, and unavailable facts. It does not turn a municipal registration into a court filing, a preliminary assessment into equity, or a signal into proof that anyone wants to sell.
>
> Live: https://acrebrief.com
>
> Code: https://github.com/GDACS-droid/solari-cookbook
>
> Source-backed Cape Coral monitor: https://acrebrief.com/florida/cape-coral/property-distress
>
> This began as a competition build, but the commercial question is real: can an acquisition team spend its time on the few property changes that deserve investigation instead of opening five county systems for every lead?
>
> @harrychow_ · @getsolari

Attach the same native demo video. If LinkedIn does not resolve the X-style handles, tag the verified people/company pages using LinkedIn's native mention picker before publishing.

## Short DM to Harry — only after the public post exists

> Harry — I just shipped and tagged you on my Solari build. AcreBrief is a live property-intelligence product built around approved Florida government data, exact parcel resolution, and evidence-backed investigation—not a toy scraper. I’d value your feedback: [PUBLIC_POST_URL]

## Preflight before approval

The public post is blocked unless every item below passes. Do not publish copy containing the monitor/code URLs while either one is stale or unavailable.

1. Require HTTP 200 from a clean browser for `/`, `/florida/cape-coral/property-distress`, `/robots.txt`, and `/sitemap.xml` on `https://acrebrief.com`.
2. Confirm the public GitHub `main` branch contains the exact local release commit SHA.
3. Confirm the native video renders with the AcreBrief UI as its first frame.
4. Replace `[PUBLIC_POST_URL]` only after the post exists.
5. Do not claim a working pilot sink until durable storage or an approved webhook has accepted a real test submission.

Independent preflight after the release commit is pushed and deployed:

```bash
npm run release:check-public
```
