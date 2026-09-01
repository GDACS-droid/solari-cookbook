import { createHmac, randomUUID } from "node:crypto"
import { databaseConfigured, withDatabaseClient } from "@/lib/postgres"

export type PilotSubmission = {
  email: string
  company?: string
  workflow?: string
  rateIdentifier: string
}

export async function pilotIntakeReady(): Promise<boolean> {
  if (!databaseConfigured() || !process.env.PILOT_RATE_LIMIT_SECRET) return false
  try {
    const result = await withDatabaseClient((client) => client.query(
      `select
         exists(select 1 from schema_migrations where version = '002_pilot_intake_controls.sql')
         and to_regclass('public.pilot_requests') is not null
         and to_regclass('public.pilot_rate_limits') is not null as ready`,
    ))
    return result.rows[0]?.ready === true
  } catch {
    return false
  }
}

function rateKey(identifier: string): string {
  const secret = process.env.PILOT_RATE_LIMIT_SECRET
  if (!secret) throw new Error("Pilot rate limiting is not configured")
  return createHmac("sha256", secret).update(identifier).digest("hex")
}

export async function persistPilotSubmission(submission: PilotSubmission): Promise<"accepted" | "rate_limited"> {
  const key = rateKey(submission.rateIdentifier)
  return withDatabaseClient(async (client) => {
    await client.query("BEGIN")
    try {
      const limit = await client.query(
        `insert into pilot_rate_limits (rate_key, window_started_at, attempts, updated_at)
         values ($1, now(), 1, now())
         on conflict (rate_key) do update set
           window_started_at = case when pilot_rate_limits.window_started_at <= now() - interval '15 minutes' then now() else pilot_rate_limits.window_started_at end,
           attempts = case when pilot_rate_limits.window_started_at <= now() - interval '15 minutes' then 1 else pilot_rate_limits.attempts + 1 end,
           updated_at = now()
         where pilot_rate_limits.window_started_at <= now() - interval '15 minutes' or pilot_rate_limits.attempts < 5
         returning attempts`,
        [key],
      )
      if (limit.rowCount !== 1) {
        await client.query("ROLLBACK")
        return "rate_limited"
      }
      await client.query(
        `insert into pilot_requests
           (pilot_request_id, email, company, workflow, source, follow_up_consent, consent_at)
         values ($1,$2,$3,$4,'acrebrief-web',true,now())
         on conflict (lower(email)) do update set
           company = coalesce(excluded.company, pilot_requests.company),
           workflow = coalesce(excluded.workflow, pilot_requests.workflow),
           follow_up_consent = true,
           consent_at = now(),
           updated_at = now()`,
        [randomUUID(), submission.email.toLowerCase(), submission.company ?? null, submission.workflow ?? null],
      )
      await client.query("COMMIT")
      return "accepted"
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  })
}
