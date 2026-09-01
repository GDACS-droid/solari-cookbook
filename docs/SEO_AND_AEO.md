# SEO and answer-engine foundation

Last reviewed: 2026-09-01.

## Locked strategy

AcreBrief will not manufacture generic “AI real-estate software” pages or near-identical county doorway pages. Public search content must be useful without a sales call and must be backed by an AcreBrief-produced, privacy-safe source observation, aggregate, methodology, or investigation.

The first page is deliberately narrow:

- `/florida/cape-coral/property-distress`
- one verified August 31, 2026 City source window;
- one privacy-minimized property example;
- exact event/observation clocks;
- official source links;
- source fact / calculation / inference / unavailable distinctions;
- explicit limitations instead of an invented continuously live market count.

No Lee, Charlotte, Collier, ZIP, monthly-report, or category URL belongs in the sitemap until it has independently useful content and a real update pipeline.

## Implemented locally

- canonical metadata and public index/follow directives;
- `robots.txt` rules that allow public pages for `Googlebot`, `Bingbot`, `OAI-SearchBot`, and `PerplexityBot` while disallowing `/api/` crawler access;
- an XML sitemap listing only `/` and the implemented Cape Coral monitor;
- a crawlable home-page link to the monitor;
- truthful Organization, Article, and BreadcrumbList JSON-LD matching visible content;
- direct-answer copy with absolute dates, primary-source provenance, methodology, privacy boundary, and material unknowns;
- desktop and mobile browser tests for crawl endpoints, content hierarchy, JSON-LD, and no unsupported “court filing” or continuously live count claim.

`SoftwareApplication` rich-result markup is intentionally withheld. Google's current required-property table calls for an offer price and a genuine rating or review. AcreBrief has neither a finalized public software offer price nor a genuine customer review, and will not invent either. Revisit after a real paid plan and eligible review exist.

## Crawler and WAF distinction

`robots.txt` is a discovery preference, not access control. Allowing named crawlers does not bypass the production rate rule for `POST /api/investigations`, and public crawlers are told not to visit `/api/`. Before release, test public `GET` responses with each named user agent. If Vercel Firewall later gains broad bot protection, permit only the documented search crawlers and verify provider-published IP ranges where supported rather than trusting a spoofable user-agent string.

The official OpenAI developer-docs corpus searched from this environment did not surface an OAI-SearchBot publisher page, so this repository does not claim that behavior was independently established there. The explicit allow rule is a safe discoverability preference requested by the site owner; production access still requires a clean-browser/user-agent check.

## External account boundaries

These require the domain owner and are not represented as complete:

After an authorized push and deployment, `npm run release:check-public` is the hard publication gate. It verifies the exact local commit on public GitHub, expected content on all four public routes, and a real AcreBrief response for each named crawler user agent.

### Google Search Console

1. Add the Domain property `acrebrief.com`.
2. Add the DNS TXT verification record Vercel shows for the property.
3. Verify ownership.
4. Submit `https://acrebrief.com/sitemap.xml`.
5. Inspect the home page and Cape Coral monitor after deployment; request indexing only after the rendered result and canonical pass.

### Bing Webmaster Tools

1. Add and verify `acrebrief.com` (or import the verified Search Console property).
2. Submit the same sitemap.
3. Inspect both URLs in Bing's live URL tool.

### IndexNow

Do not generate or publish a key accidentally from a local-only build. After approval:

1. generate a protocol-compatible key owned by AcreBrief;
2. host the exact key file at the site root;
3. submit only URLs that were actually added, updated, or deleted;
4. keep the submission out of page-render requests and fail it independently from content publication;
5. verify accepted submissions in Bing Webmaster Tools.

### Analytics

Add a privacy-reviewed analytics sink before claiming search conversions. Preserve referral parameters, including `utm_source`, without storing unnecessary property-investigation inputs. Measure monitor views, evidence-source clicks, live-investigation starts/completions, pilot CTA clicks, and accepted pilot records. Do not show fabricated counters.

## Content gate for the next page

A new indexable market page must answer all of these:

1. What original, current AcreBrief observation or aggregate makes it non-commodity?
2. Are the source and access basis production-approved?
3. Are exact dates and the coverage window visible?
4. Is personal/contact data excluded or justified?
5. Can a reader reproduce or audit the methodology?
6. Are unavailable facts and market-coverage limits explicit?
7. Is there an internal link and a real user action beyond “schedule a demo”?

If any answer is no, keep the route out of the sitemap.
