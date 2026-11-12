import { asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'

import { db } from '@/db'
import { taskFolders as folders, tasks } from '@/db/schema'
import type {
  CompleteInput,
  ExportFolder,
  ExportTask,
  FolderInput,
  MoveInput,
  TaskInput,
  TasksFile,
} from '@/lib/tasks/schemas'
import { reorderIds } from '@/lib/tasks/tree'

// Server-only DB helpers. Only import from *.functions.ts.

// Sibling order: position, then name/title case-insensitively.
const byFolderName = sql`${folders.name} collate nocase`
const byTaskTitle = sql`${tasks.title} collate nocase`

export async function loadTree() {
  const [allFolders, allTasks] = await Promise.all([
    db.select().from(folders).orderBy(asc(folders.position), byFolderName),
    db.select().from(tasks).orderBy(asc(tasks.position), byTaskTitle),
  ])
  return { folders: allFolders, tasks: allTasks }
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

async function nextTaskPosition(folderId: number | null) {
  const [row] = await db
    .select({ value: max(tasks.position) })
    .from(tasks)
    .where(
      folderId === null ? isNull(tasks.folderId) : eq(tasks.folderId, folderId),
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

// An unnamed folder is named after the date (the client sends its local
// date; this fallback uses the server's).
function folderName(name: string) {
  return name || new Date().toISOString().slice(0, 10)
}

export async function insertFolder(input: FolderInput) {
  await assertFolderExists(input.parentId)
  const position = await nextFolderPosition(input.parentId)
  const [row] = await db
    .insert(folders)
    .values({ ...input, name: folderName(input.name), position })
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
      name: folderName(input.name),
      ...(moved && { position: await nextFolderPosition(input.parentId) }),
    })
    .where(eq(folders.id, id))
}

// Deletes the folder with all its subfolders and tasks. Done by hand: SQLite
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
    await tx.delete(tasks).where(inArray(tasks.folderId, ids))
    await tx.delete(folders).where(inArray(folders.id, ids))
  })
}

export async function insertTask(input: TaskInput) {
  await assertFolderExists(input.folderId)
  const position = await nextTaskPosition(input.folderId)
  const [row] = await db
    .insert(tasks)
    .values({ ...input, position })
    .returning({ id: tasks.id })
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

export async function editTask(id: number, input: TaskInput) {
  const { folderId } = input
  await assertFolderExists(folderId)
  const existing = (
    await db
      .select({ folderId: tasks.folderId, dueAt: tasks.dueAt })
      .from(tasks)
      .where(eq(tasks.id, id))
  ).at(0)
  if (!existing) throw new Error('Task not found')

  const moved = existing.folderId !== folderId
  // A new due date re-arms its reminder.
  const rescheduled =
    (existing.dueAt?.getTime() ?? null) !== (input.dueAt?.getTime() ?? null)
  await db
    .update(tasks)
    .set({
      ...input,
      folderId,
      ...(moved && { position: await nextTaskPosition(folderId) }),
      ...(rescheduled && { remindedAt: null }),
    })
    .where(eq(tasks.id, id))
}

export async function removeTask(id: number) {
  await db.delete(tasks).where(eq(tasks.id, id))
}

export async function setCompleted({ id, done }: CompleteInput) {
  await db
    .update(tasks)
    .set({ completedAt: done ? new Date() : null })
    .where(eq(tasks.id, id))
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
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          parentId === null
            ? isNull(tasks.folderId)
            : eq(tasks.folderId, parentId),
        )
        .orderBy(asc(tasks.position), byTaskTitle)
      const order = reorderIds(
        siblings.map((s) => s.id),
        id,
        index,
      )
      for (const [position, siblingId] of order.entries()) {
        await tx
          .update(tasks)
          // Reordering isn't an edit: keep updatedAt.
          .set({
            position,
            updatedAt: sql`${tasks.updatedAt}`,
            ...(siblingId === id && { folderId: parentId }),
          })
          .where(eq(tasks.id, siblingId))
      }
    }
  })
}

// Adds the file's contents after the existing top-level items (never
// replaces anything). All or nothing.
export async function importFile(file: TasksFile) {
  const counts = { folders: 0, tasks: 0 }
  const [folderStart, taskStart] = await Promise.all([
    nextFolderPosition(null),
    nextTaskPosition(null),
  ])
  const now = new Date()

  await db.transaction(async (tx) => {
    const addTasks = async (
      items: Array<ExportTask>,
      folderId: number | null,
      start: number,
    ) => {
      if (!items.length) return
      await tx.insert(tasks).values(
        items.map((task, i) => ({
          title: task.title,
          description: task.description ?? '',
          folderId,
          position: start + i,
          createdAt: task.createdAt ? new Date(task.createdAt) : now,
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
          dueAt: task.dueAt ? new Date(task.dueAt) : null,
          // Past reminders aren't sent again after an import.
          remindedAt: task.dueAt && new Date(task.dueAt) <= now ? now : null,
        })),
      )
      counts.tasks += items.length
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
        await addTasks(folder.tasks, row.id, 0)
      }
    }

    await addFolders(file.folders, null, folderStart)
    await addTasks(file.tasks, null, taskStart)
  })
  return counts
}
