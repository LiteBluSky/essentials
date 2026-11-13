import type { Client, InStatement, InValue, Row } from '@libsql/client'
import { getTableName } from 'drizzle-orm'

import { activeDatabase, connectRemote, db, localDb } from '@/db'
import * as schema from '@/db/schema'

// Server-only. "Copy" in Settings → Database: replaces every app's data in
// the database in use with another database's, ids and all (so references,
// Undo and chats keep pointing at the right rows). `settings` and
// `databases` aren't copied: they only matter in the local file.

/** Parents before children (folders, then their items; conversations, then
 * messages). Cleared in the reverse order. */
const TABLES = [
  schema.folders,
  schema.links,
  schema.linksBin,
  schema.noteFolders,
  schema.notes,
  schema.notesBin,
  schema.taskFolders,
  schema.tasks,
  schema.contactFolders,
  schema.contacts,
  schema.calendarEvents,
  schema.financeEntries,
  schema.financeMonths,
  schema.financeSubscriptions,
  schema.financePending,
  schema.financeBudgets,
  schema.chatConversations,
  schema.chatMessages,
  schema.assistantLog,
  schema.assistantChanges,
].map((table) => getTableName(table))

/** Rows per INSERT statement. */
const CHUNK = 100

/** Copies everything from a database (a remote one's id, or null for the
 * local file) into the one in use, replacing what's there, in one
 * all-or-nothing batch. Returns how many rows were copied. */
export async function copyFromDatabase(id: number | null) {
  const active = activeDatabase()
  if (id === active.id) throw new Error('That is the database in use')

  let source: Client = localDb.$client
  let close = false
  if (id !== null) {
    const row = await localDb.query.databases.findFirst({
      where: (d, { eq }) => eq(d.id, id),
    })
    if (!row) throw new Error('That database was removed')
    try {
      // Also brings its schema up to date, so the columns match.
      source = (await connectRemote(row.url, row.authToken)).$client
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Couldn't connect to ${row.name}: ${message}`)
    }
    close = true
  }

  try {
    const statements: Array<InStatement> = [...TABLES]
      .reverse()
      .map((table) => `delete from "${table}"`)
    let copied = 0
    for (const table of TABLES) {
      const result = await source.execute(`select * from "${table}"`)
      const rows = parentsFirst(result.rows, result.columns)
      copied += rows.length
      const columns = result.columns.map((c) => `"${c}"`).join(', ')
      const slots = `(${result.columns.map(() => '?').join(', ')})`
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        statements.push({
          sql: `insert into "${table}" (${columns}) values ${chunk.map(() => slots).join(', ')}`,
          args: chunk.flatMap((row) =>
            result.columns.map((c) => row[c] as InValue),
          ),
        })
      }
    }
    await db.$client.batch(statements, 'write')
    return { copied }
  } finally {
    if (close) source.close()
  }
}

/** Folder tables reference themselves: a parent goes in before its
 * children, in case the database enforces foreign keys. */
function parentsFirst(rows: Array<Row>, columns: Array<string>) {
  if (!columns.includes('parent_id')) return rows
  const placed = new Set<unknown>()
  const ordered: Array<Row> = []
  let left = rows
  while (left.length) {
    const next = left.filter(
      (row) => row.parent_id === null || placed.has(row.parent_id),
    )
    // A dangling parent: keep the rest as they are.
    if (!next.length) return [...ordered, ...left]
    for (const row of next) placed.add(row.id)
    ordered.push(...next)
    left = left.filter((row) => !next.includes(row))
  }
  return ordered
}
