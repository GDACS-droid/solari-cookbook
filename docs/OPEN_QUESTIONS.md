# Open questions

| Priority | Question | Why it matters | Owner / next evidence |
| --- | --- | --- | --- |
| P0 | Will Lee Clerk confirm the Civil Suit Case List category codebook, cadence, delivery/backfill, and AcreBrief cloud/customer use under its Data Extract Agreement? | determines whether the $180/year feed can emit `NEW_FORECLOSURE_CASE` | owner submits official records request with the questions in `LEE_CLERK_BULK_EVALUATION.md`; no purchase/signature by Codex |
| P0 | What precise scope is enabled by the current Solari account/key? | constrains live browser/sandbox/replay demo | account owner verifies console plan/limits; do not expose key |
| P0 | May Codex provision the Vercel Marketplace Neon Postgres resource and add its server-side driver? | current Vercel filesystem cannot durably/transactionally back source watermarks, transitions, leases, and pilot intake | owner explicitly approves provisioning; then apply `db/migrations/001_cape_coral_snapshots.sql`, implement/test the SQL adapter, and enable cron/intake |
| P0 | What durable global quota should replace the competition limiter? | app concurrency plus Vercel WAF 1/60s per IP+JA4 are still regional/non-atomic | add an atomic Vercel/Upstash-compatible global lease before general availability |
| P1 | Is there an approved tax-status source for Lee parcel IDs? | score quality and live fan-out | official tax collector source/terms research |
| P1 | How are court records retained and redacted under AOSC24-65 for this workflow? | privacy/access compliance | counsel/compliance review |
| P1 | What are verified automation/rate-limit terms for each source? | determines adapter enablement | source-by-source registry update |
| P2 | Which paid data license adds enough value to justify cost? | equity/AVM/mortgage claims must be licensed | pilot interviews + vendor terms |
| P2 | Will 3–10 target teams accept a pilot? | validates willingness to pay | invite real prospects; record only actual feedback |
