import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createClient } from '@libsql/client'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

import * as schema from './schema.ts'

export type Db = ReturnType<typeof open>

const migrationsFolder = resolve('drizzle')

function open(url: string, authToken?: string) {
  const client = createClient({ url, authToken: authToken || undefined })
  return drizzle({ client, schema })
}

// A single SQLite file, created on first start. Relative paths resolve from
// the working directory (the project root for `pnpm dev` and start.ps1).
const path = resolve(process.env.DATABASE_PATH || 'data/essentials.db')
mkdirSync(dirname(path), { recursive: true })

/** The local file. Always open: it holds `settings` and `databases` (the
 * remote databases and which one is in use), whichever database the data
 * comes from. */
export const localDb = open(pathToFileURL(path).href)

// Bring the schema up to date (creates the tables on a fresh file).
await migrate(localDb, { migrationsFolder })

/** The settings key (not in SETTINGS: no env fallback, not in the form)
 * holding the id of the remote database in use; missing = the local file. */
export const ACTIVE_DATABASE_KEY = 'ACTIVE_DATABASE'

/** Opens a remote libSQL database (Turso, sqld), checks it answers and
 * brings its schema up to date. Throws if it can't. */
export async function connectRemote(url: string, authToken: string) {
  const remote = open(url, authToken)
  try {
    await remote.run(sql`select 1`)
    await migrate(remote, { migrationsFolder })
    return remote
  } catch (error) {
    remote.$client.close()
    throw error
  }
}

/** What the data is read from now. `startupError`: the saved remote
 * database couldn't be reached when the server started, so it fell back to
 * the local file. */
export type ActiveDatabase = {
  id: number | null
  name: string
  startupError?: { name: string; message: string }
}

let current: Db = localDb
let active: ActiveDatabase = { id: null, name: 'Local' }

export function activeDatabase(): ActiveDatabase {
  return active
}

/** A rename of the database in use (same connection). */
export function renameActive(name: string) {
  active = { ...active, name }
}

/** Points `db` at another database (the caller saves the choice). */
export function setActive(next: Db, info: ActiveDatabase) {
  const previous = current
  current = next
  active = info
  if (previous !== localDb && previous !== next) previous.$client.close()
}

// Start on the database picked in Settings, if it's reachable.
const saved = await localDb
  .select()
  .from(schema.settings)
  .where(eq(schema.settings.key, ACTIVE_DATABASE_KEY))
  .get()
if (saved) {
  const source = await localDb
    .select()
    .from(schema.databases)
    .where(eq(schema.databases.id, Number(saved.value)))
    .get()
  if (source) {
    try {
      setActive(await connectRemote(source.url, source.authToken), {
        id: source.id,
        name: source.name,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        `Database "${source.name}" unreachable, using local:`,
        error,
      )
      active = {
        id: null,
        name: 'Local',
        startupError: { name: source.name, message },
      }
    }
  }
}

/**
 * The data: every app's tables, in the database in use (the local file, or
 * a remote one picked in Settings). A stand-in that forwards to it, so a
 * switch takes effect everywhere without re-importing.
 */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    const value = Reflect.get(current, prop, current) as unknown
    return typeof value === 'function'
      ? (value as (...args: Array<unknown>) => unknown).bind(current)
      : value
  },
})
