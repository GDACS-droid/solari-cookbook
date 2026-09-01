import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless"
import ws from "ws"

neonConfig.webSocketConstructor = ws

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

function connectionString(): string {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error("Database is not configured")
  const parsed = new URL(value)
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("Database URL must use PostgreSQL")
  return value
}

function pool(): Pool {
  return new Pool({
    connectionString: connectionString(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })
}

export async function withDatabaseClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const requestPool = pool()
  const client = await requestPool.connect()
  try { return await operation(client) } finally { client.release(); await requestPool.end() }
}
