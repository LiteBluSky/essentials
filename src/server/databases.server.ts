import { resolve } from 'node:path'

import { eq } from 'drizzle-orm'

import {
  ACTIVE_DATABASE_KEY,
  activeDatabase,
  connectRemote,
  localDb,
  renameActive,
  setActive,
} from '@/db'
import { databases, settings } from '@/db/schema'
import type {
  DatabaseInput,
  DatabaseUpdate,
  DatabasesView,
} from '@/lib/databases'

// Server-only. The list of remote databases and the choice live in the
// local file (`localDb`), never in a remote one.

export async function viewDatabases(): Promise<DatabasesView> {
  const rows = await localDb
    .select()
    .from(databases)
    .orderBy(databases.createdAt)
  const active = activeDatabase()
  return {
    activeId: active.id,
    localPath: resolve(process.env.DATABASE_PATH || 'data/essentials.db'),
    startupError: active.startupError ?? null,
    databases: rows.map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      tokenHint: row.authToken ? row.authToken.slice(-4) : null,
    })),
  }
}

/** Saves a remote database once it answers (its tables are created then). */
export async function addDatabase(input: DatabaseInput) {
  const remote = await connectRemote(input.url, input.authToken).catch(
    (error: unknown) => {
      throw new Error(`Couldn't connect: ${errorMessage(error)}`)
    },
  )
  remote.$client.close()
  const [row] = await localDb
    .insert(databases)
    .values(input)
    .returning({ id: databases.id })
  return row
}

/** Changes a remote database's name, URL or token. A new URL / token must
 * connect first; if it's the one in use, the data switches to the new
 * connection. */
export async function updateDatabase(input: DatabaseUpdate) {
  const source = await localDb
    .select()
    .from(databases)
    .where(eq(databases.id, input.id))
    .get()
  if (!source) throw new Error('That database was removed')
  const authToken = input.clearToken ? '' : input.authToken || source.authToken
  const changed = input.url !== source.url || authToken !== source.authToken
  const inUse = activeDatabase().id === source.id
  if (changed) {
    const remote = await connectRemote(input.url, authToken).catch(
      (error: unknown) => {
        throw new Error(`Couldn't connect: ${errorMessage(error)}`)
      },
    )
    if (inUse) {
      setActive(remote, { id: source.id, name: input.name })
    } else {
      remote.$client.close()
    }
  } else if (inUse) {
    renameActive(input.name)
  }
  await localDb
    .update(databases)
    .set({ name: input.name, url: input.url, authToken })
    .where(eq(databases.id, source.id))
  return { reload: changed && inUse }
}

/** Switches the data to a remote database (null = the local file) and
 * remembers it for the next start. Nothing is copied between them. */
export async function selectDatabase(id: number | null) {
  if (id === null) {
    setActive(localDb, { id: null, name: 'Local' })
    await localDb.delete(settings).where(eq(settings.key, ACTIVE_DATABASE_KEY))
    return
  }
  const source = await localDb
    .select()
    .from(databases)
    .where(eq(databases.id, id))
    .get()
  if (!source) throw new Error('That database was removed')
  const remote = await connectRemote(source.url, source.authToken).catch(
    (error: unknown) => {
      throw new Error(
        `Couldn't connect to ${source.name}: ${errorMessage(error)}`,
      )
    },
  )
  setActive(remote, { id: source.id, name: source.name })
  await localDb
    .insert(settings)
    .values({ key: ACTIVE_DATABASE_KEY, value: String(id) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: String(id), updatedAt: new Date() },
    })
}

/** Forgets a remote database (its data stays where it is). Not the one in
 * use: switch away first. */
export async function removeDatabase(id: number) {
  if (activeDatabase().id === id) {
    throw new Error('Switch to another database before removing this one')
  }
  await localDb.delete(databases).where(eq(databases.id, id))
  const saved = await localDb
    .select()
    .from(settings)
    .where(eq(settings.key, ACTIVE_DATABASE_KEY))
    .get()
  // The saved choice it was, if it failed at startup.
  if (saved?.value === String(id)) {
    await localDb.delete(settings).where(eq(settings.key, ACTIVE_DATABASE_KEY))
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
