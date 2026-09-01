import { readFile, writeFile } from "node:fs/promises"
import process from "node:process"
import { parse } from "yaml"

const registryPath = new URL("../data/source_registry.yaml", import.meta.url)
const outputPath = new URL("../src/lib/source-policy.generated.ts", import.meta.url)
const registry = parse(await readFile(registryPath, "utf8"))

if (!registry || !Array.isArray(registry.sources)) throw new Error("Source registry must contain a sources array")

const policy = {}
const productionAccessBases = new Set(["PUBLIC_DOWNLOAD", "OPEN_DATA_API", "PAID_LICENSE", "EXPRESS_PERMISSION"])
for (const source of registry.sources) {
  if (!source.runtime_policy) continue
  const item = source.runtime_policy
  if (typeof source.source_id !== "string" || !source.source_id) throw new Error("Runtime source is missing source_id")
  if (!['APPROVED', 'REVIEW_REQUIRED'].includes(item.automation_approval)) throw new Error(`${source.source_id} has an invalid automation approval`)
  if (!Array.isArray(item.exact_urls) || item.exact_urls.length === 0) throw new Error(`${source.source_id} must declare exact_urls`)
  const snapshotBudget = item.max_snapshot_requests_per_run ?? item.max_requests_per_run
  if (!Number.isInteger(snapshotBudget) || snapshotBudget < 0) throw new Error(`${source.source_id} has an invalid snapshot request budget`)
  for (const url of item.exact_urls) {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") throw new Error(`${source.source_id} contains a non-HTTPS runtime URL`)
  }
  if (item.automation_approval === "APPROVED") {
    if (!productionAccessBases.has(source.access_basis)) throw new Error(`${source.source_id} cannot be APPROVED with access_basis ${source.access_basis ?? "missing"}`)
    if (!item.accountable_reviewer || !item.terms_reviewed_at || !item.approval_expires_at || !(item.max_requests_per_run > 0)) {
      throw new Error(`${source.source_id} cannot be APPROVED without reviewer, terms date, expiry, and a positive request budget`)
    }
  }
  policy[source.source_id] = {
    accessBasis: source.access_basis,
    automationApproval: item.automation_approval,
    exactUrls: item.exact_urls,
    termsReviewedAt: item.terms_reviewed_at ?? null,
    approvalExpiresAt: item.approval_expires_at ?? null,
    accountableReviewer: item.accountable_reviewer ?? null,
    maxRequestsPerRun: item.max_requests_per_run,
    maxSnapshotRequestsPerRun: snapshotBudget,
  }
}

const generated = `/* This file is generated from data/source_registry.yaml. Do not edit by hand. */
export const GENERATED_SOURCE_POLICY = ${JSON.stringify(policy, null, 2)} as const
`

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "")
  if (current !== generated) {
    console.error("Generated source policy is stale. Run npm run source-policy:generate.")
    process.exit(1)
  }
  console.log(`validated ${Object.keys(policy).length} runtime source policies against the YAML registry`)
} else {
  await writeFile(outputPath, generated)
  console.log(`generated ${Object.keys(policy).length} runtime source policies`)
}
