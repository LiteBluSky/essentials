import { asc, desc, eq, inArray, isNull, lt, max, sql } from 'drizzle-orm'

import { db } from '@/db'
import { noteFolders as folders, notes, notesBin } from '@/db/schema'
import type { Note } from '@/db/schema'
import { binCutoff, folderPathOf } from '@/lib/bin'
import type {
  ExportFolder,
  ExportNote,
  FolderInput,
  MoveInput,
  NoteInput,
  NotesFile,
} from '@/lib/notes/schemas'
import { reorderIds } from '@/lib/notes/tree'

// Server-only DB helpers. Only import from *.functions.ts.

// Sibling order: position, then name/title case-insensitively.
const byFolderName = sql`${folders.name} collate nocase`
const byNoteTitle = sql`${notes.title} collate nocase`

export async function loadTree() {
  const [allFolders, allNotes] = await Promise.all([
    db.select().from(folders).orderBy(asc(folders.position), byFolderName),
    db.select().from(notes).orderBy(asc(notes.position), byNoteTitle),
  ])
  return { folders: allFolders, notes: allNotes }
}

async function nextFolderPosition(parentId: number | null) {
  const [row] = await db
    .select({ value: max(folders.position) })
    .from(folders)
    .where(
      parentId === null
        ? isNull(folders.parentId)
        : eq(folders.parentId, parentId),
    )
  return (row.value ?? -1) + 1
}

async function nextNotePosition(folderId: number | null) {
  const [row] = await db
    .select({ value: max(notes.position) })
    .from(notes)
    .where(
      folderId === null ? isNull(notes.folderId) : eq(notes.folderId, folderId),
    )
  return (row.value ?? -1) + 1
}

async function assertFolderExists(id: number | null) {
  if (id === null) return
  const row = (
    await db.select({ id: folders.id }).from(folders).where(eq(folders.id, id))
  ).at(0)
  if (!row) throw new Error('Folder not found')
}

// Walks up from `targetParentId` to make sure `folderId` isn't one of its
// ancestors — otherwise the move would create a cycle.
async function assertNotDescendant(
  folderId: number,
  targetParentId: number | null,
) {
  let current = targetParentId
  while (current !== null) {
    if (current === folderId) {
      throw new Error("A folder can't be moved into itself or its subfolders")
    }
    const row = (
      await db
        .select({ parentId: folders.parentId })
        .from(folders)
        .where(eq(folders.id, current))
    ).at(0)
    current = row?.parentId ?? null
  }
}

export async function insertFolder(input: FolderInput) {
  await assertFolderExists(input.parentId)
  const position = await nextFolderPosition(input.parentId)
  const [row] = await db
    .insert(folders)
    .values({ ...input, position })
    .returning({ id: folders.id })
  return row
}

/** The id of the top-level folder named `name` (case-insensitive), created
 * at the end of the top level if there's none. */
export async function ensureTopFolder(name: string) {
  const existing = (
    await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        sql`${folders.parentId} is null and ${folders.name} = ${name} collate nocase`,
      )
      .orderBy(asc(folders.position))
      .limit(1)
  ).at(0)
  if (existing) return existing.id
  return (await insertFolder({ name, parentId: null })).id
}

export async function editFolder(id: number, input: FolderInput) {
  await assertFolderExists(input.parentId)
  await assertNotDescendant(id, input.parentId)
  const existing = (
    await db
      .select({ parentId: folders.parentId })
      .from(folders)
      .where(eq(folders.id, id))
  ).at(0)
  if (!existing) throw new Error('Folder not found')

  const moved = existing.parentId !== input.parentId
  await db
    .update(folders)
    .set({
      ...input,
      ...(moved && { position: await nextFolderPosition(input.parentId) }),
    })
    .where(eq(folders.id, id))
}

// Copies of deleted notes for the bin, with where they were.
async function binnedNotes(rows: Array<Note>) {
  const pathOf = folderPathOf(
    await db
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
      })
      .from(folders),
  )
  const deletedAt = new Date()
  return rows.map((note) => ({
    title: note.title,
    body: note.body,
    folderId: note.folderId,
    folderPath: pathOf(note.folderId),
    viewCount: note.viewCount,
    openedAt: note.openedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt,
  }))
}

// Deletes the folder with all its subfolders; their notes go to the bin.
// Done by hand: SQLite only honours ON DELETE CASCADE with a per-connection
// pragma, which libsql doesn't keep across the connections it opens.
export async function removeFolder(id: number) {
  const all = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
  const ids = [id]
  // Array iteration also visits the ids pushed along the way.
  for (const parentId of ids) {
    for (const f of all) if (f.parentId === parentId) ids.push(f.id)
  }
  const inside = await db
    .select()
    .from(notes)
    .where(inArray(notes.folderId, ids))
  const binned = await binnedNotes(inside)
  await db.transaction(async (tx) => {
    if (binned.length) await tx.insert(notesBin).values(binned)
    await tx.delete(notes).where(inArray(notes.folderId, ids))
    await tx.delete(folders).where(inArray(folders.id, ids))
  })
  await purgeBin()
}

// A new note counts as opened, so it shows up under "Recent" straight away.
export async function insertNote(input: NoteInput) {
  await assertFolderExists(input.folderId)
  const position = await nextNotePosition(input.folderId)
  const [row] = await db
    .insert(notes)
    .values({ ...input, position, viewCount: 1, openedAt: new Date() })
    .returning({ id: notes.id })
  return row
}

export async function editNote(id: number, input: NoteInput) {
  await assertFolderExists(input.folderId)
  const existing = (
    await db
      .select({ folderId: notes.folderId })
      .from(notes)
      .where(eq(notes.id, id))
  ).at(0)
  if (!existing) throw new Error('Note not found')

  const moved = existing.folderId !== input.folderId
  await db
    .update(notes)
    .set({
      ...input,
      ...(moved && { position: await nextNotePosition(input.folderId) }),
    })
    .where(eq(notes.id, id))
}

// Moves the note to the bin.
export async function removeNote(id: number) {
  const note = (await db.select().from(notes).where(eq(notes.id, id))).at(0)
  if (!note) return
  const binned = await binnedNotes([note])
  await db.transaction(async (tx) => {
    await tx.insert(notesBin).values(binned)
    await tx.delete(notes).where(eq(notes.id, id))
  })
  await purgeBin()
}

// ---- Bin ------------------------------------------------------------------

async function purgeBin() {
  await db.delete(notesBin).where(lt(notesBin.deletedAt, binCutoff()))
}

export async function loadBin() {
  await purgeBin()
  return db
    .select()
    .from(notesBin)
    .orderBy(desc(notesBin.deletedAt), desc(notesBin.id))
}

// Puts the note back at the end of its folder, or the top level if that
// folder is gone too. Its views and dates come back with it.
export async function restoreNote(id: number) {
  const row = (await db.select().from(notesBin).where(eq(notesBin.id, id))).at(
    0,
  )
  if (!row) throw new Error('That note is no longer in the bin')
  let folderId = row.folderId
  if (folderId !== null) {
    const folder = (
      await db
        .select({ id: folders.id })
        .from(folders)
        .where(eq(folders.id, folderId))
    ).at(0)
    if (!folder) folderId = null
  }
  const position = await nextNotePosition(folderId)
  return db.transaction(async (tx) => {
    const [note] = await tx
      .insert(notes)
      .values({
        title: row.title,
        body: row.body,
        folderId,
        position,
        viewCount: row.viewCount,
        openedAt: row.openedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .returning({ id: notes.id, folderId: notes.folderId })
    await tx.delete(notesBin).where(eq(notesBin.id, id))
    return note
  })
}

export async function removeFromBin(id: number) {
  await db.delete(notesBin).where(eq(notesBin.id, id))
}

export async function clearBin() {
  await db.delete(notesBin)
}

// Counts an open for "Recent" / "Most viewed" without touching updatedAt.
export async function recordView(id: number) {
  await db
    .update(notes)
    .set({
      viewCount: sql`${notes.viewCount} + 1`,
      openedAt: new Date(),
      updatedAt: sql`${notes.updatedAt}`,
    })
    .where(eq(notes.id, id))
}

// Rewrites sibling positions 0..n so the moved item lands at `index`.
export async function moveItem({ kind, id, parentId, index }: MoveInput) {
  await assertFolderExists(parentId)
  if (kind === 'folder') await assertNotDescendant(id, parentId)

  await db.transaction(async (tx) => {
    if (kind === 'folder') {
      const siblings = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(
          parentId === null
            ? isNull(folders.parentId)
            : eq(folders.parentId, parentId),
        )
        .orderBy(asc(folders.position), byFolderName)
      const order = reorderIds(
        siblings.map((s) => s.id),
        id,
        index,
      )
      for (const [position, siblingId] of order.entries()) {
        await tx
          .update(folders)
          .set(siblingId === id ? { position, parentId } : { position })
          .where(eq(folders.id, siblingId))
      }
    } else {
      const siblings = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(
          parentId === null
            ? isNull(notes.folderId)
            : eq(notes.folderId, parentId),
        )
        .orderBy(asc(notes.position), byNoteTitle)
      const order = reorderIds(
        siblings.map((s) => s.id),
        id,
        index,
      )
      for (const [position, siblingId] of order.entries()) {
        await tx
          .update(notes)
          // Reordering isn't an edit: keep updatedAt.
          .set({
            position,
            updatedAt: sql`${notes.updatedAt}`,
            ...(siblingId === id && { folderId: parentId }),
          })
          .where(eq(notes.id, siblingId))
      }
    }
  })
}

// Adds the file's contents after the existing top-level items (never
// replaces anything). All or nothing.
export async function importFile(file: NotesFile) {
  const counts = { folders: 0, notes: 0 }
  const [folderStart, noteStart] = await Promise.all([
    nextFolderPosition(null),
    nextNotePosition(null),
  ])

  await db.transaction(async (tx) => {
    const addNotes = async (
      items: Array<ExportNote>,
      folderId: number | null,
      start: number,
    ) => {
      if (!items.length) return
      await tx.insert(notes).values(
        items.map((note, i) => ({
          title: note.title ?? '',
          body: note.body,
          folderId,
          position: start + i,
        })),
      )
      counts.notes += items.length
    }

    const addFolders = async (
      items: Array<ExportFolder>,
      parentId: number | null,
      start: number,
    ) => {
      for (const [i, folder] of items.entries()) {
        const [row] = await tx
          .insert(folders)
          .values({ name: folder.name, parentId, position: start + i })
          .returning({ id: folders.id })
        counts.folders++
        await addFolders(folder.folders, row.id, 0)
        await addNotes(folder.notes, row.id, 0)
      }
    }

    await addFolders(file.folders, null, folderStart)
    await addNotes(file.notes, null, noteStart)
  })
  return counts
}
