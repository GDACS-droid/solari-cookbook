# Security model

## Threat model

The product accepts user property queries and processes untrusted public documents. Highest risks are secret/profile leakage, server-side request forgery, malicious/oversized downloads, source access misuse, sensitive evidence exposure, confused property resolution, and misleading completion after partial failure.

## Controls

- Keep `SOLARI_API_KEY`, provider credentials, cookies, profile IDs, database credentials, and session recordings out of the browser bundle, logs, git, fixtures, and screenshots. Use server-only environment variables and `.env.example` placeholders.
- Allow-list official source origins and download MIME types; reject user-supplied arbitrary URLs, private IP ranges, redirects to disallowed hosts, and unsafe schemes before retrieval.
- Treat PDFs/HTML/ZIPs as untrusted: size/time limits, content-type/magic-byte checks, isolated Sandbox parsing, no macros/executable files, checksum and provenance.
- Validate every input and adapter output with a schema; normalize/escape content before display; avoid untrusted HTML rendering.
- Use least privilege for each source. Never bypass CAPTCHA/access controls or use a profile unless the portal owner and data use are authorized.
- Encrypt/restrict evidence at rest; signed/short-lived artifact access; redact before public replay; audit evidence views/exports.
- Make source failure explicit. A partial run cannot assert a complete investigation, mutate historical evidence, or produce a repeated alert.
- Avoid person-centric search expansion. Entity resolution is confined to a property-owning entity and is confidence-scored.
- Require `ACREBRIEF_LIVE_ACCESS_TOKEN` outside the competition deployment. The competition route explicitly opts into `ACREBRIEF_PUBLIC_LIVE_DEMO=true`, is locked to one property, and combines process-local single concurrency/cooldown with a published Vercel WAF rule limiting `POST /api/investigations` to one request per 60 seconds per IP+JA4 key. Vercel documents WAF counters as regional, so this is bounded competition protection—not a durable global quota or general-availability abuse control. Stream cancellation propagates to remote-resource cleanup.
- Environment configuration is never sufficient source authorization: generated policy must compile a permitted `access_basis`, exact source URL, `APPROVED` state, reviewer, expiry, terms-review date, and positive request budget. CI rejects drift. Publisher/Clerk sources remain `REVIEW_REQUIRED` even when credentials exist.
- The DOR download is HTTPS-only, does not follow redirects, uses bounded connection/total/retry limits, and caps the ZIP at 60 MB compressed and 400 MB expanded. The archive must contain one exact unencrypted non-traversing CSV entry; its RFC-4180 parser requires unique named headers and exactly one matching parcel row. The City query requests one exact ObjectID and an explicit field allow-list that excludes account/customer/name/address fields.
- Never send raw Solari Browser/Sandbox handles to the client. SSE receives a one-way 12-character run reference only.
- Keep Solari recording disabled until provider retention/deletion behavior and an application-side review/redaction lifecycle are implemented. Validate both the requested URL and final navigation origin/path before extracting any page content.

## Release checklist

```bash
git status --short
git log --all -- . ':!node_modules'
rg -n --hidden -g '!node_modules' -g '!.git' '(SOLARI_API_KEY=slr_live_|sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH) PRIVATE)'
npm audit --omit=dev
npm run verify
```

Review results manually; a no-match secret scan does not prove absence of historical or external exposure. Rotate a credential if it was ever committed or printed.
