import { and, asc, desc, eq, gt, inArray, isNull, max } from 'drizzle-orm'

import { db, listProfiles, profileHandle, withDatabase } from '@/db'
import {
  assistantChanges,
  calendarEvents,
  financeEntries,
  financeSubscriptions,
  folders as bookmarkFolders,
  contactFolders,
  contacts,
  links,
  linksBin,
  noteFolders,
  notes,
  notesBin,
  taskFolders,
  tasks,
} from '@/db/schema'
import type { AssistantChange } from '@/db/schema'
import type { ChangeSummary } from '@/lib/assistant'

// Server-only: the assistant's change log and Undo. Each change the AI makes
// is recorded under its run (one Tell me request / chat turn) with what was
// there before; undoing a run walks its changes newest first and puts each
// back: a created thing is deleted, an edit restored, a deletion re-inserted
// with its original ids (and the Bin copies it made removed).

export type App =
  | 'bookmarks'
  | 'notes'
  | 'tasks'
  | 'contacts'
  | 'calendar'
  | 'finances'
  | 'subscriptions'

// The tables per app. They share the columns used here (id, folderId /
// parentId), so one table type stands in for all of them. The Calendar and
// Finances have no folders (their rows are only ever `item` changes).
type ItemTable = typeof notes
type FolderTable = typeof noteFolders
const ITEMS = {
  bookmarks: links,
  notes,
  tasks,
  contacts,
  calendar: calendarEvents,
  finances: financeEntries,
  subscriptions: financeSubscriptions,
} as unknown as Record<App, ItemTable>
const FOLDERS = {
  bookmarks: bookmarkFolders,
  notes: noteFolders,
  tasks: taskFolders,
  contacts: contactFolders,
} as unknown as Record<App, FolderTable>
const BINS = { bookmarks: linksBin, notes: notesBin } as unknown as Partial<
  Record<App, typeof notesBin>
>

type Row = Record<string, unknown> & { id: number }

export function itemTable(app: App) {
  return ITEMS[app]
}
export function folderTable(app: App) {
  return FOLDERS[app]
}

export async function getItem(app: App, id: number): Promise<Row | null> {
  const table = ITEMS[app]
  return (await db.select().from(table).where(eq(table.id, id))).at(0) ?? null
}

export async function getFolder(app: App, id: number): Promise<Row | null> {
  const table = FOLDERS[app]
  return (await db.select().from(table).where(eq(table.id, id))).at(0) ?? null
}

/** An item's name for messages: its title (a contact's name), else the
 * start of a note. */
export function itemLabel(row: Row) {
  const title =
    typeof row.title === 'string'
      ? row.title
      : typeof row.name === 'string'
        ? row.name
        : ''
  if (title) return title
  const body = typeof row.body === 'string' ? row.body : ''
  return body.trim().split('\n')[0].slice(0, 60) || 'Untitled'
}

async function record(
  runId: string,
  change: Omit<typeof assistantChanges.$inferInsert, 'runId'>,
) {
  await db.insert(assistantChanges).values({ runId, ...change })
}

/** Something new (undo deletes it). */
export function recordCreate(
  runId: string,
  summary: Omit<ChangeSummary, 'op'>,
) {
  return record(runId, {
    app: summary.app,
    target: summary.target,
    op: 'create',
    itemId: summary.id,
    label: summary.label,
  })
}

/** An edit (undo puts `before` back). */
export function recordUpdate(
  runId: string,
  summary: Omit<ChangeSummary, 'op'>,
  before: Row,
) {
  return record(runId, {
    app: summary.app,
    target: summary.target,
    op: 'update',
    itemId: summary.id,
    label: summary.label,
    before: JSON.stringify(before),
  })
}

async function maxBinId(app: App) {
  const bin = BINS[app]
  if (!bin) return 0
  const [row] = await db.select({ value: max(bin.id) }).from(bin)
  return row.value ?? 0
}

async function binIdsSince(app: App, after: number) {
  const bin = BINS[app]
  if (!bin) return []
  const rows = await db
    .select({ id: bin.id })
    .from(bin)
    .where(gt(bin.id, after))
  return rows.map((r) => r.id)
}

/** Deletes an item through `remove` (the app's own delete, Bin included),
 * recording it first. */
export async function deleteItemRecorded(
  runId: string,
  app: App,
  id: number,
  remove: () => Promise<void>,
) {
  const row = await getItem(app, id)
  if (!row) throw new Error('Nothing with that id')
  const binFrom = await maxBinId(app)
  await remove()
  const label = itemLabel(row)
  await record(runId, {
    app,
    target: 'item',
    op: 'delete',
    itemId: id,
    label,
    before: JSON.stringify({ folders: [], items: [row] }),
    binIds: JSON.stringify(await binIdsSince(app, binFrom)),
  })
  return label
}

/** Deletes a folder with everything in it through `remove`, recording
 * every row first (parents before children). */
export async function deleteFolderRecorded(
  runId: string,
  app: App,
  id: number,
  remove: () => Promise<void>,
) {
  const folderRows = FOLDERS[app]
  const itemRows = ITEMS[app]
  const all = (await db.select().from(folderRows)) as Array<Row>
  const root = all.find((f) => f.id === id)
  if (!root) throw new Error('No folder with that id')
  const ids = [id]
  for (const parentId of ids) {
    for (const f of all) if (f.parentId === parentId) ids.push(f.id)
  }
  const folders = ids.map((fid) => all.find((f) => f.id === fid)!)
  const items = (await db
    .select()
    .from(itemRows)
    .where(inArray(itemRows.folderId, ids))) as Array<Row>

  const binFrom = await maxBinId(app)
  await remove()
  const label = String(root.name)
  await record(runId, {
    app,
    target: 'folder',
    op: 'delete',
    itemId: id,
    label,
    before: JSON.stringify({ folders, items }),
    binIds: JSON.stringify(await binIdsSince(app, binFrom)),
  })
  return { label, folders: folders.length, items: items.length }
}

/** A snapshot's dates come back from JSON as strings. */
function revive(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      key.endsWith('At') && typeof value === 'string' ? new Date(value) : value,
    ]),
  )
}

export type UndoResult = { undone: number; skipped: Array<string> }

/** `undoRun` in every profile: a run that worked across profiles recorded
 * each change in the profile it happened in. One that can't be reached is
 * reported as skipped. */
export async function undoRunEverywhere(runId: string): Promise<UndoResult> {
  const total: UndoResult = { undone: 0, skipped: [] }
  for (const profile of await listProfiles()) {
    try {
      const handle = await profileHandle(profile.id)
      const one = await withDatabase(handle, () => undoRun(runId))
      total.undone += one.undone
      total.skipped.push(...one.skipped)
    } catch (error) {
      if (!profile.active) {
        console.error(`Undo in "${profile.name}" failed:`, error)
        continue
      }
      throw error
    }
  }
  return total
}

/** Undoes a run's changes (those not undone yet), newest first. */
export async function undoRun(runId: string): Promise<UndoResult> {
  const changes = await db
    .select()
    .from(assistantChanges)
    .where(
      and(eq(assistantChanges.runId, runId), isNull(assistantChanges.undoneAt)),
    )
    .orderBy(desc(assistantChanges.id))
  const result: UndoResult = { undone: 0, skipped: [] }
  for (const change of changes) {
    const skip = await undoChange(change)
    if (skip) result.skipped.push(skip)
    else result.undone++
    await db
      .update(assistantChanges)
      .set({ undoneAt: new Date() })
      .where(eq(assistantChanges.id, change.id))
  }
  return result
}

/** Puts one change back; returns why not, if it can't be. */
async function undoChange(change: AssistantChange): Promise<string | null> {
  const app = change.app
  const isFolder = change.target === 'folder'
  const table = isFolder ? FOLDERS[app] : ITEMS[app]
  const what = `${isFolder ? 'folder' : 'item'} “${change.label}”`

  if (change.op === 'create') {
    const exists = isFolder
      ? await getFolder(app, change.itemId)
      : await getItem(app, change.itemId)
    if (!exists) return null // Already gone.
    if (isFolder) {
      const child = (
        await db
          .select({ id: FOLDERS[app].id })
          .from(FOLDERS[app])
          .where(eq(FOLDERS[app].parentId, change.itemId))
          .limit(1)
      ).at(0)
      const item = (
        await db
          .select({ id: ITEMS[app].id })
          .from(ITEMS[app])
          .where(eq(ITEMS[app].folderId, change.itemId))
          .limit(1)
      ).at(0)
      if (child || item) return `Kept the ${what}: it isn't empty any more`
    }
    await db.delete(table).where(eq(table.id, change.itemId))
    return null
  }

  if (change.op === 'update') {
    if (!change.before) return `Couldn't restore the ${what}`
    const { id: _id, ...before } = JSON.parse(change.before) as Row
    const exists = isFolder
      ? await getFolder(app, change.itemId)
      : await getItem(app, change.itemId)
    if (!exists) return `Couldn't restore the ${what}: it was deleted since`
    await db
      .update(table)
      .set(revive(before))
      .where(eq(table.id, change.itemId))
    return null
  }

  // A deletion: put the rows back (parent folders first), drop the Bin
  // copies it made.
  if (!change.before) return `Couldn't restore the ${what}`
  const { folders, items } = JSON.parse(change.before) as {
    folders: Array<Row>
    items: Array<Row>
  }
  await db.transaction(async (tx) => {
    for (const folder of folders) {
      const taken = (
        await tx
          .select({ id: FOLDERS[app].id })
          .from(FOLDERS[app])
          .where(eq(FOLDERS[app].id, folder.id))
      ).at(0)
      if (!taken) await tx.insert(FOLDERS[app]).values(revive(folder) as never)
    }
    for (const item of items) {
      const taken = (
        await tx
          .select({ id: ITEMS[app].id })
          .from(ITEMS[app])
          .where(eq(ITEMS[app].id, item.id))
      ).at(0)
      if (!taken) await tx.insert(ITEMS[app]).values(revive(item) as never)
    }
    const bin = BINS[app]
    const binIds = change.binIds
      ? (JSON.parse(change.binIds) as Array<number>)
      : []
    if (bin && binIds.length)
      await tx.delete(bin).where(inArray(bin.id, binIds))
  })
  return null
}

/** A run's changes still undoable (for its Undo button). */
export async function pendingChanges(runId: string) {
  return db
    .select()
    .from(assistantChanges)
    .where(
      and(eq(assistantChanges.runId, runId), isNull(assistantChanges.undoneAt)),
    )
    .orderBy(asc(assistantChanges.id))
}

/** Which of these runs still have changes to undo. */
export async function undoableRuns(runIds: Array<string | null>) {
  const ids = [...new Set(runIds.filter((r): r is string => r !== null))]
  if (!ids.length) return new Set<string>()
  const rows = await db
    .selectDistinct({ runId: assistantChanges.runId })
    .from(assistantChanges)
    .where(
      and(
        inArray(assistantChanges.runId, ids),
        isNull(assistantChanges.undoneAt),
      ),
    )
  return new Set(rows.map((r) => r.runId))
}
