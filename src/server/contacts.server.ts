import { asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'

import { db } from '@/db'
import { contactFolders as folders, contacts } from '@/db/schema'
import type {
  ContactInput,
  ContactsFile,
  ExportContact,
  ExportFolder,
  FolderInput,
  MoveInput,
} from '@/lib/contacts/schemas'
import { reorderIds } from '@/lib/contacts/tree'

// Server-only DB helpers. Only import from *.functions.ts.

// Sibling order: position, then name case-insensitively.
const byFolderName = sql`${folders.name} collate nocase`
const byContactName = sql`${contacts.name} collate nocase`

export async function loadTree() {
  const [allFolders, allContacts] = await Promise.all([
    db.select().from(folders).orderBy(asc(folders.position), byFolderName),
    db.select().from(contacts).orderBy(asc(contacts.position), byContactName),
  ])
  return { folders: allFolders, contacts: allContacts }
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

async function nextContactPosition(folderId: number | null) {
  const [row] = await db
    .select({ value: max(contacts.position) })
    .from(contacts)
    .where(
      folderId === null
        ? isNull(contacts.folderId)
        : eq(contacts.folderId, folderId),
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

// Deletes the folder with all its subfolders and contacts. Done by hand:
// SQLite only honours ON DELETE CASCADE with a per-connection pragma, which
// libsql doesn't keep across the connections it opens.
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
    await tx.delete(contacts).where(inArray(contacts.folderId, ids))
    await tx.delete(folders).where(inArray(folders.id, ids))
  })
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

export async function insertContact(input: ContactInput) {
  await assertFolderExists(input.folderId)
  const position = await nextContactPosition(input.folderId)
  const [row] = await db
    .insert(contacts)
    .values({ ...input, position })
    .returning({ id: contacts.id })
  return row
}

export async function editContact(id: number, input: ContactInput) {
  await assertFolderExists(input.folderId)
  const existing = (
    await db
      .select({ folderId: contacts.folderId, birthday: contacts.birthday })
      .from(contacts)
      .where(eq(contacts.id, id))
  ).at(0)
  if (!existing) throw new Error('Contact not found')

  const moved = existing.folderId !== input.folderId
  await db
    .update(contacts)
    .set({
      ...input,
      ...(moved && { position: await nextContactPosition(input.folderId) }),
      // A new birthday is reminded on its day, even if one went out this year.
      ...(existing.birthday !== input.birthday && {
        birthdayRemindedYear: null,
      }),
    })
    .where(eq(contacts.id, id))
}

export async function removeContact(id: number) {
  await db.delete(contacts).where(eq(contacts.id, id))
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
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          parentId === null
            ? isNull(contacts.folderId)
            : eq(contacts.folderId, parentId),
        )
        .orderBy(asc(contacts.position), byContactName)
      const order = reorderIds(
        siblings.map((s) => s.id),
        id,
        index,
      )
      for (const [position, siblingId] of order.entries()) {
        await tx
          .update(contacts)
          .set(
            siblingId === id ? { position, folderId: parentId } : { position },
          )
          .where(eq(contacts.id, siblingId))
      }
    }
  })
}

// Adds the file's contents after the existing top-level items (never
// replaces anything). All or nothing.
export async function importFile(file: ContactsFile) {
  const counts = { folders: 0, contacts: 0 }
  const [folderStart, contactStart] = await Promise.all([
    nextFolderPosition(null),
    nextContactPosition(null),
  ])

  await db.transaction(async (tx) => {
    const addContacts = async (
      items: Array<ExportContact>,
      folderId: number | null,
      start: number,
    ) => {
      if (!items.length) return
      await tx.insert(contacts).values(
        items.map((c, i) => ({
          name: c.name,
          phone: c.phone ?? '',
          email: c.email ?? '',
          address: c.address ?? '',
          knownFrom: c.knownFrom ?? '',
          birthday: c.birthday ?? '',
          description: c.description ?? '',
          folderId,
          position: start + i,
        })),
      )
      counts.contacts += items.length
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
        await addContacts(folder.contacts, row.id, 0)
      }
    }

    await addFolders(file.folders, null, folderStart)
    await addContacts(file.contacts, null, contactStart)
  })
  return counts
}
