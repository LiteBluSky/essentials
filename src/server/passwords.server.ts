import { asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  passwordFolders as folders,
  passwordVault,
  passwords,
} from '@/db/schema'
import type {
  FolderInput,
  ImportFolder,
  ImportPassword,
  MoveInput,
  PasswordInput,
  PasswordsImport,
} from '@/lib/passwords/schemas'
import { reorderIds } from '@/lib/passwords/tree'

// Server-only DB helpers. Only import from *.functions.ts. The server never
// sees a password in clear: `secret` comes sealed from the browser
// (lib/passwords/vault.ts) and goes back as is.

// Sibling order: position, then name case-insensitively.
const byFolderName = sql`${folders.name} collate nocase`
const byPasswordName = sql`${passwords.name} collate nocase`

export async function loadTree() {
  const [allFolders, allPasswords] = await Promise.all([
    db.select().from(folders).orderBy(asc(folders.position), byFolderName),
    db
      .select()
      .from(passwords)
      .orderBy(asc(passwords.position), byPasswordName),
  ])
  return { folders: allFolders, passwords: allPasswords }
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

async function nextPasswordPosition(folderId: number | null) {
  const [row] = await db
    .select({ value: max(passwords.position) })
    .from(passwords)
    .where(
      folderId === null
        ? isNull(passwords.folderId)
        : eq(passwords.folderId, folderId),
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

// Deletes the folder with all its subfolders and passwords. Done by hand:
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
    await tx.delete(passwords).where(inArray(passwords.folderId, ids))
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

export async function insertPassword(input: PasswordInput) {
  await assertFolderExists(input.folderId)
  const position = await nextPasswordPosition(input.folderId)
  const [row] = await db
    .insert(passwords)
    .values({ ...input, position })
    .returning({ id: passwords.id })
  return row
}

export async function editPassword(id: number, input: PasswordInput) {
  await assertFolderExists(input.folderId)
  const existing = (
    await db
      .select({ folderId: passwords.folderId })
      .from(passwords)
      .where(eq(passwords.id, id))
  ).at(0)
  if (!existing) throw new Error('Password not found')

  const moved = existing.folderId !== input.folderId
  await db
    .update(passwords)
    .set({
      ...input,
      ...(moved && { position: await nextPasswordPosition(input.folderId) }),
    })
    .where(eq(passwords.id, id))
}

export async function removePassword(id: number) {
  await db.delete(passwords).where(eq(passwords.id, id))
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
        .select({ id: passwords.id })
        .from(passwords)
        .where(
          parentId === null
            ? isNull(passwords.folderId)
            : eq(passwords.folderId, parentId),
        )
        .orderBy(asc(passwords.position), byPasswordName)
      const order = reorderIds(
        siblings.map((s) => s.id),
        id,
        index,
      )
      for (const [position, siblingId] of order.entries()) {
        await tx
          .update(passwords)
          .set(
            siblingId === id ? { position, folderId: parentId } : { position },
          )
          .where(eq(passwords.id, siblingId))
      }
    }
  })
}

// Adds the file's contents after the existing top-level items (never
// replaces anything). All or nothing. The secrets come sealed.
export async function importFile(file: PasswordsImport) {
  const counts = { folders: 0, passwords: 0 }
  const [folderStart, passwordStart] = await Promise.all([
    nextFolderPosition(null),
    nextPasswordPosition(null),
  ])

  await db.transaction(async (tx) => {
    const addPasswords = async (
      items: Array<ImportPassword>,
      folderId: number | null,
      start: number,
    ) => {
      if (!items.length) return
      await tx
        .insert(passwords)
        .values(items.map((p, i) => ({ ...p, folderId, position: start + i })))
      counts.passwords += items.length
    }

    const addFolders = async (
      items: Array<ImportFolder>,
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
        await addPasswords(folder.passwords, row.id, 0)
      }
    }

    await addFolders(file.folders, null, folderStart)
    await addPasswords(file.passwords, null, passwordStart)
  })
  return counts
}

// ---- The vault ---------------------------------------------------------------

const VAULT_ID = 1

/** The vault's salt, scrypt parameters and check value; null until a master
 * password is set. Nothing secret: they only help the browser derive the
 * key. */
export async function loadVault() {
  const row = (
    await db.select().from(passwordVault).where(eq(passwordVault.id, VAULT_ID))
  ).at(0)
  return row ? { salt: row.salt, kdf: row.kdf, check: row.check } : null
}

/** Sets the master password once (there's no vault yet). */
export async function insertVault(vault: {
  salt: string
  kdf: string
  check: string
}) {
  if (await loadVault())
    throw new Error('The vault already has a master password')
  // A vault left without its key would hold secrets nobody can open.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(passwords)
  if (count > 0) throw new Error('There are passwords sealed with another key')
  await db.insert(passwordVault).values({ id: VAULT_ID, ...vault })
}

/** A new master password: the vault row and every secret, all at once. Every
 * stored password must be in `entries` (sealed with the new key). */
export async function rekeyVault(input: {
  vault: { salt: string; kdf: string; check: string }
  entries: Array<{ id: number; secret: string }>
}) {
  const ids = await db.select({ id: passwords.id }).from(passwords)
  const given = new Set(input.entries.map((e) => e.id))
  if (ids.length !== given.size || ids.some((r) => !given.has(r.id))) {
    throw new Error('The passwords changed meanwhile: reload and try again')
  }
  await db.transaction(async (tx) => {
    for (const entry of input.entries) {
      await tx
        .update(passwords)
        .set({ secret: entry.secret, updatedAt: sql`${passwords.updatedAt}` })
        .where(eq(passwords.id, entry.id))
    }
    await tx
      .update(passwordVault)
      .set(input.vault)
      .where(eq(passwordVault.id, VAULT_ID))
  })
}
