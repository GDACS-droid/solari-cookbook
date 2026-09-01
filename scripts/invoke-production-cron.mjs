const secret = process.env.CRON_SECRET
if (!secret) throw new Error("CRON_SECRET is required")
const baseUrl = process.env.ACREBRIEF_PRODUCTION_URL ?? "https://acrebrief.com"
const response = await fetch(new URL("/api/cron/cape-coral-snapshot", baseUrl), {
  headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
  redirect: "error",
})
const body = await response.json().catch(() => ({ error: "Non-JSON response" }))
console.log(JSON.stringify({ httpStatus: response.status, ...body }, null, 2))
if (!response.ok) process.exitCode = 1
