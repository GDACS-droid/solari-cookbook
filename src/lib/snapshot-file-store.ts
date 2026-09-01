import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { SnapshotStore, SnapshotTransition, SourceSnapshot } from "@/lib/snapshots"

const stateSchema = z.object({
  version: z.literal(1),
  snapshots: z.record(z.string(), z.unknown()),
  transitions: z.array(z.unknown()),
})

interface FileState {
  version: 1
  snapshots: Record<string, SourceSnapshot>
  transitions: SnapshotTransition[]
}

const emptyState = (): FileState => ({ version: 1, snapshots: {}, transitions: [] })

/** Local/VM durable store. Vercel production must use the transactional SQL
 * schema in db/migrations; an ephemeral serverless filesystem is not durable. */
export class JsonFileSnapshotStore implements SnapshotStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<FileState> {
    const raw = await readFile(this.filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (raw === null) return emptyState()
    return stateSchema.parse(JSON.parse(raw)) as FileState
  }

  async load(sourceId: string): Promise<SourceSnapshot | null> {
    return structuredClone((await this.read()).snapshots[sourceId] ?? null)
  }

  async commit(sourceId: string, expectedGeneration: number, next: SourceSnapshot, transitions: SnapshotTransition[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const lockPath = `${this.filePath}.lock`
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    const lockToken = randomUUID()
    const processStart = await processStartIdentity(process.pid)
    if (!processStart) throw new Error("Cannot establish local snapshot-writer identity")
    let lock: Awaited<ReturnType<typeof open>> | undefined
    let lockPublished = false
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          lock = await open(lockPath, "wx", 0o600)
          await lock.writeFile(JSON.stringify({ token: lockToken, pid: process.pid, processStart, acquiredAt: new Date().toISOString() }))
          lockPublished = true
          break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 19) throw error
          const lockOwner = await readLockOwner(lockPath)
          const publishedOwner = isPublishedLockOwner(lockOwner) ? lockOwner : null
          if (!publishedOwner) {
            const declaredAge = lockOwner?.acquiredAt ? Date.now() - new Date(lockOwner.acquiredAt).getTime() : Number.NaN
            const age = Number.isFinite(declaredAge) ? declaredAge : await stat(lockPath).then((value) => Date.now() - value.mtimeMs).catch(() => 0)
            if (age > 30_000) {
              await rm(lockPath, { force: true })
              continue
            }
          }
          const currentOwnerStart = publishedOwner ? await processStartIdentity(publishedOwner.pid) : null
          if (publishedOwner && currentOwnerStart !== publishedOwner.processStart) {
            await rm(lockPath, { force: true })
            continue
          }
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
      }
      if (!lock) throw new Error("Snapshot file lock was not acquired")
      if ((await readLockOwner(lockPath))?.token !== lockToken) throw new Error("Snapshot file lock ownership was lost")
      const state = await this.read()
      const currentGeneration = state.snapshots[sourceId]?.generation ?? 0
      if (currentGeneration !== expectedGeneration) throw new Error(`Snapshot generation conflict for ${sourceId}`)
      const emitted = new Set(state.transitions.map((transition) => transition.transitionId))
      for (const transition of transitions) {
        if (emitted.has(transition.transitionId)) continue
        emitted.add(transition.transitionId)
        state.transitions.push(transition)
      }
      state.snapshots[sourceId] = structuredClone(next)
      await writeFile(tempPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 })
      if ((await readLockOwner(lockPath))?.token !== lockToken) throw new Error("Snapshot file lock ownership was lost before commit")
      await rename(tempPath, this.filePath)
    } finally {
      if (lock) {
        await lock.close()
        if (!lockPublished || (await readLockOwner(lockPath))?.token === lockToken) await rm(lockPath, { force: true })
      }
      await rm(tempPath, { force: true })
    }
  }

  async readTransitions(): Promise<SnapshotTransition[]> {
    return structuredClone((await this.read()).transitions)
  }
}

interface LockOwner { token?: string; pid?: number; processStart?: string; acquiredAt?: string }

function isPublishedLockOwner(owner: LockOwner | null): owner is Required<Pick<LockOwner, "token" | "pid" | "processStart">> & LockOwner {
  return typeof owner?.token === "string" && owner.token.length > 0 && Number.isInteger(owner.pid) && (owner.pid ?? 0) > 0 && typeof owner.processStart === "string" && owner.processStart.length > 0
}

async function readLockOwner(path: string): Promise<LockOwner | null> {
  return readFile(path, "utf8").then((value) => JSON.parse(value) as LockOwner).catch(() => null)
}

async function processStartIdentity(pid: number): Promise<string | null> {
  return readFile(`/proc/${pid}/stat`, "utf8").then((value) => {
    const close = value.lastIndexOf(")")
    const fields = close >= 0 ? value.slice(close + 1).trim().split(/\s+/) : []
    const startTime = fields[19]
    return startTime ? `${pid}:${startTime}` : null
  }).catch(() => null)
}
