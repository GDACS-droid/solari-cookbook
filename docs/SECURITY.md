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
- Require `ACREBRIEF_LIVE_ACCESS_TOKEN` for every paid run, permit one live run per server instance, propagate stream cancellation to remote-resource cleanup, and keep `ACREBRIEF_APPROVED_SOURCE_IDS` empty until accountable source review is complete. Production scale also requires a durable cross-instance quota/rate-limit service.

## Release checklist

```bash
git status --short
git log --all -- . ':!node_modules'
rg -n --hidden -g '!node_modules' -g '!.git' '(SOLARI_API_KEY=slr_live_|sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH) PRIVATE)'
npm audit --omit=dev
npm run verify
```

Review results manually; a no-match secret scan does not prove absence of historical or external exposure. Rotate a credential if it was ever committed or printed.
