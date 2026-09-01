import { timingSafeEqual } from "node:crypto"

export function cronAuthorized(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false
  const supplied = Buffer.from(authorization.slice(7), "utf8")
  const expected = Buffer.from(secret, "utf8")
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
