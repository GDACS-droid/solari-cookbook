import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Pool, neonConfig } from "@neondatabase/serverless"
import ws from "ws"

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required")
const parsed = new URL(connectionString)
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("Database URL must use PostgreSQL")

const directory = resolve("db/migrations")
const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
const pool = new Pool({ connectionString, max: 1, allowExitOnIdle: true })
const client = await pool.connect()

try {
  await client.query(`create table if not exists schema_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`)
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8")
    const checksum = createHash("sha256").update(sql).digest("hex")
    const current = await client.query("select checksum from schema_migrations where version = $1", [file])
    if (current.rows[0]) {
      if (current.rows[0].checksum !== checksum) throw new Error(`Applied migration checksum changed: ${file}`)
      console.log(`verified ${file}`)
      continue
    }
    await client.query("BEGIN")
    try {
      await client.query(sql)
      await client.query("insert into schema_migrations (version, checksum) values ($1,$2)", [file, checksum])
      await client.query("COMMIT")
      console.log(`applied ${file}`)
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  }
} finally {
  client.release()
  await pool.end()
}
