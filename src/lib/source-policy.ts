import { GENERATED_SOURCE_POLICY } from "@/lib/source-policy.generated"

export type RuntimeSourceId = keyof typeof GENERATED_SOURCE_POLICY

interface RuntimePolicy {
  automationApproval: "APPROVED" | "REVIEW_REQUIRED"
  exactUrls: readonly string[]
  termsReviewedAt: string | null
  approvalExpiresAt: string | null
  accountableReviewer: string | null
  maxRequestsPerRun: number
}

const policies = GENERATED_SOURCE_POLICY as Record<RuntimeSourceId, RuntimePolicy>

export function sourcePolicyAllows(registrySourceId: RuntimeSourceId, exactUrl: string, now = new Date()): boolean {
  const policy = policies[registrySourceId]
  if (policy.automationApproval !== "APPROVED") return false
  if (!policy.exactUrls.some((url) => url === exactUrl)) return false
  if (!policy.accountableReviewer || !policy.termsReviewedAt || !policy.approvalExpiresAt || policy.maxRequestsPerRun < 1) return false
  return new Date(policy.approvalExpiresAt).getTime() > now.getTime()
}

export function sourceRequestBudget(registrySourceId: RuntimeSourceId): number {
  return policies[registrySourceId].maxRequestsPerRun
}
