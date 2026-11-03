import { asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'

import { db } from '@/db'
import { noteFolders as folders, notes } from '@/db/schema'
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

// Deletes the folder with all its subfolders and notes. Done by hand: SQLite
// only honours ON DELETE CASCADE with a per-connection pragma, which libsql
// doesn't keep across the connections it opens.
export async function removeFolder(id: number) {
  const all = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
  const ids = [id]
  // Array iteration also visits the ids pushed along the way.
  for (const parentId of ids) {
    for (const f of all) if (f.parentId === parentId) ids.push(f.id)
  }
  await db.transaction(async (tx) => {
    await tx.delete(notes).where(inArray(notes.folderId, ids))
    await tx.delete(folders).where(inArray(folders.id, ids))
  })
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

export async function removeNote(id: number) {
  await db.delete(notes).where(eq(notes.id, id))
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
