import {
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
} from 'drizzle-orm'

import { db } from '@/db'
import { folders, links, linksBin } from '@/db/schema'
import type { Link } from '@/db/schema'
import { binCutoff, folderPathOf } from '@/lib/bin'
import { MAX_FAVORITES } from '@/lib/bookmarks/schemas'
import type {
  BookmarksFile,
  ExportFolder,
  ExportLink,
  FavoriteInput,
  FolderInput,
  LinkInput,
  MoveInput,
} from '@/lib/bookmarks/schemas'
import { reorderIds } from '@/lib/bookmarks/tree'

// Server-only DB helpers. Only import from *.functions.ts.

// Sibling order: position, then name/title case-insensitively.
const byFolderName = sql`${folders.name} collate nocase`
const byLinkTitle = sql`${links.title} collate nocase`

export async function loadTree() {
  const [allFolders, allLinks] = await Promise.all([
    db.select().from(folders).orderBy(asc(folders.position), byFolderName),
    db.select().from(links).orderBy(asc(links.position), byLinkTitle),
  ])
  return { folders: allFolders, links: allLinks }
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

async function nextLinkPosition(folderId: number | null) {
  const [row] = await db
    .select({ value: max(links.position) })
    .from(links)
    .where(
      folderId === null ? isNull(links.folderId) : eq(links.folderId, folderId),
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

function titleFromUrl(url: string) {
  return new URL(url).hostname.replace(/^www\./, '')
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

// Copies of deleted links for the bin, with where they were.
async function binnedLinks(rows: Array<Link>) {
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
  return rows.map((link) => ({
    title: link.title,
    url: link.url,
    description: link.description,
    folderId: link.folderId,
    folderPath: pathOf(link.folderId),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    deletedAt,
  }))
}

// Deletes the folder with all its subfolders; their links go to the bin.
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
    .from(links)
    .where(inArray(links.folderId, ids))
  const binned = await binnedLinks(inside)
  await db.transaction(async (tx) => {
    if (binned.length) await tx.insert(linksBin).values(binned)
    await tx.delete(links).where(inArray(links.folderId, ids))
    await tx.delete(folders).where(inArray(folders.id, ids))
  })
  await purgeBin()
}

export async function insertLink(input: LinkInput) {
  await assertFolderExists(input.folderId)
  const position = await nextLinkPosition(input.folderId)
  const [row] = await db
    .insert(links)
    .values({
      ...input,
      title: input.title || titleFromUrl(input.url),
      description: input.description || null,
      position,
    })
    .returning({ id: links.id })
  return row
}

export async function editLink(id: number, input: LinkInput) {
  await assertFolderExists(input.folderId)
  const existing = (
    await db
      .select({ folderId: links.folderId })
      .from(links)
      .where(eq(links.id, id))
  ).at(0)
  if (!existing) throw new Error('Link not found')

  const moved = existing.folderId !== input.folderId
  await db
    .update(links)
    .set({
      ...input,
      title: input.title || titleFromUrl(input.url),
      description: input.description || null,
      ...(moved && { position: await nextLinkPosition(input.folderId) }),
    })
    .where(eq(links.id, id))
}

// Moves the link to the bin (it stops being a favourite).
export async function removeLink(id: number) {
  const link = (await db.select().from(links).where(eq(links.id, id))).at(0)
  if (!link) return
  const binned = await binnedLinks([link])
  await db.transaction(async (tx) => {
    await tx.insert(linksBin).values(binned)
    await tx.delete(links).where(eq(links.id, id))
  })
  await purgeBin()
}

// ---- Bin ------------------------------------------------------------------

async function purgeBin() {
  await db.delete(linksBin).where(lt(linksBin.deletedAt, binCutoff()))
}

export async function loadBin() {
  await purgeBin()
  return db
    .select()
    .from(linksBin)
    .orderBy(desc(linksBin.deletedAt), desc(linksBin.id))
}

// Puts the link back at the end of its folder, or the top level if that
// folder is gone too.
export async function restoreLink(id: number) {
  const row = (await db.select().from(linksBin).where(eq(linksBin.id, id))).at(
    0,
  )
  if (!row) throw new Error('That link is no longer in the bin')
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
  const position = await nextLinkPosition(folderId)
  return db.transaction(async (tx) => {
    const [link] = await tx
      .insert(links)
      .values({
        title: row.title,
        url: row.url,
        description: row.description,
        folderId,
        position,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .returning({ id: links.id, folderId: links.folderId })
    await tx.delete(linksBin).where(eq(linksBin.id, id))
    return link
  })
}

export async function removeFromBin(id: number) {
  await db.delete(linksBin).where(eq(linksBin.id, id))
}

export async function clearBin() {
  await db.delete(linksBin)
}

// Adds the link at the end of the favourites, or removes it.
export async function setFavorite({ id, favorite }: FavoriteInput) {
  if (!favorite) {
    await db
      .update(links)
      .set({ favoritePosition: null })
      .where(eq(links.id, id))
    return
  }
  await db.transaction(async (tx) => {
    const existing = (
      await tx
        .select({ favoritePosition: links.favoritePosition })
        .from(links)
        .where(eq(links.id, id))
    ).at(0)
    if (!existing) throw new Error('Link not found')
    if (existing.favoritePosition !== null) return

    const [row] = await tx
      .select({ total: count(), last: max(links.favoritePosition) })
      .from(links)
      .where(isNotNull(links.favoritePosition))
    if (row.total >= MAX_FAVORITES) {
      throw new Error(`You can have up to ${MAX_FAVORITES} favourites`)
    }
    await tx
      .update(links)
      .set({ favoritePosition: (row.last ?? -1) + 1 })
      .where(eq(links.id, id))
  })
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
        .select({ id: links.id })
        .from(links)
        .where(
          parentId === null
            ? isNull(links.folderId)
            : eq(links.folderId, parentId),
        )
        .orderBy(asc(links.position), byLinkTitle)
      const order = reorderIds(
        siblings.map((s) => s.id),
        id,
        index,
      )
      for (const [position, siblingId] of order.entries()) {
        await tx
          .update(links)
          .set(
            siblingId === id ? { position, folderId: parentId } : { position },
          )
          .where(eq(links.id, siblingId))
      }
    }
  })
}

// The file's favourites in rank order, mapped to their new favoritePosition
// after the existing favourites. Whatever doesn't fit in the free slots is
// imported as a plain link.
async function importedFavorites(file: BookmarksFile) {
  const found: Array<ExportLink> = []
  const walk = (items: {
    folders: Array<ExportFolder>
    links: Array<ExportLink>
  }) => {
    for (const link of items.links) if (link.favorite) found.push(link)
    items.folders.forEach(walk)
  }
  walk(file)
  found.sort((a, b) => a.favorite! - b.favorite!)

  const [row] = await db
    .select({ total: count(), last: max(links.favoritePosition) })
    .from(links)
    .where(isNotNull(links.favoritePosition))
  const fits = found.slice(0, Math.max(0, MAX_FAVORITES - row.total))
  const start = (row.last ?? -1) + 1
  return {
    positions: new Map(fits.map((link, i) => [link, start + i])),
    skipped: found.length - fits.length,
  }
}

// Adds the file's contents after the existing top-level items (never
// replaces anything). All or nothing.
export async function importFile(file: BookmarksFile) {
  const counts = { folders: 0, links: 0, favorites: 0, skippedFavorites: 0 }
  const [folderStart, linkStart, favorites] = await Promise.all([
    nextFolderPosition(null),
    nextLinkPosition(null),
    importedFavorites(file),
  ])
  counts.favorites = favorites.positions.size
  counts.skippedFavorites = favorites.skipped

  await db.transaction(async (tx) => {
    const addLinks = async (
      items: Array<ExportLink>,
      folderId: number | null,
      start: number,
    ) => {
      if (!items.length) return
      await tx.insert(links).values(
        items.map((link, i) => ({
          title: link.title || titleFromUrl(link.url),
          url: link.url,
          description: link.description || null,
          folderId,
          position: start + i,
          favoritePosition: favorites.positions.get(link) ?? null,
        })),
      )
      counts.links += items.length
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
        await addLinks(folder.links, row.id, 0)
      }
    }

    await addFolders(file.folders, null, folderStart)
    await addLinks(file.links, null, linkStart)
  })
  return counts
}
