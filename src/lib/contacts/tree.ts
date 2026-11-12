import type { Folder, Contact } from '@/db/schema'
import { EXPORT_FORMAT } from '@/lib/contacts/schemas'
import type {
  ContactsFile,
  ExportFolder,
  ExportContact,
} from '@/lib/contacts/schemas'

export type FolderNode = {
  folder: Folder
  folders: Array<FolderNode>
  contacts: Array<Contact>
  /** Total contacts in this folder and all subfolders. */
  contactCount: number
}

export type Tree = {
  folders: Array<FolderNode>
  contacts: Array<Contact>
}

// Rows arrive pre-sorted by position from the server; grouping keeps that order.
export function buildTree(
  folders: Array<Folder>,
  contacts: Array<Contact>,
): Tree {
  const nodes = new Map<number, FolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { folder, folders: [], contacts: [], contactCount: 0 })
  }

  const root: Tree = { folders: [], contacts: [] }
  for (const node of nodes.values()) {
    const parentId = node.folder.parentId
    const parent = parentId === null ? undefined : nodes.get(parentId)
    ;(parent ?? root).folders.push(node)
  }
  for (const contact of contacts) {
    const parent =
      contact.folderId === null ? undefined : nodes.get(contact.folderId)
    ;(parent ?? root).contacts.push(contact)
  }

  const count = (node: FolderNode): number => {
    node.contactCount =
      node.contacts.length + node.folders.reduce((n, f) => n + count(f), 0)
    return node.contactCount
  }
  root.folders.forEach(count)

  return root
}

function contactMatches(contact: Contact, query: string) {
  return [
    contact.name,
    contact.phone,
    contact.email,
    contact.address,
    contact.knownFrom,
    contact.description,
  ].some((value) => value.toLowerCase().includes(query))
}

// Keeps contacts that match, plus the folders leading to them. A folder whose own
// name matches keeps all of its contents.
export function filterTree(tree: Tree, rawQuery: string): Tree {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return tree

  const filterNode = (node: FolderNode): FolderNode | null => {
    if (node.folder.name.toLowerCase().includes(query)) return node
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const contacts = node.contacts.filter((l) => contactMatches(l, query))
    if (!folders.length && !contacts.length) return null
    return { ...node, folders, contacts }
  }

  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    contacts: tree.contacts.filter((l) => contactMatches(l, query)),
  }
}

export type FolderOption = { id: number; name: string; depth: number }

// Depth-first flat list for folder pickers. `excludeId` drops that folder and
// its descendants (a folder can't be moved into itself).
export function flattenFolders(
  tree: Tree,
  excludeId?: number,
): Array<FolderOption> {
  const out: Array<FolderOption> = []
  const walk = (nodes: Array<FolderNode>, depth: number) => {
    for (const node of nodes) {
      if (node.folder.id === excludeId) continue
      out.push({ id: node.folder.id, name: node.folder.name, depth })
      walk(node.folders, depth + 1)
    }
  }
  walk(tree.folders, 0)
  return out
}

/** `ids` without `id`, then `id` inserted at `index` (clamped). */
export function reorderIds(ids: Array<number>, id: number, index: number) {
  const rest = ids.filter((x) => x !== id)
  const at = Math.min(Math.max(index, 0), rest.length)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** Ids of the folders or contacts directly under `parentId`, in display order. */
export function childIds(
  tree: Tree,
  kind: 'folder' | 'contact',
  parentId: number | null,
): Array<number> {
  const container = parentId === null ? tree : findFolder(tree, parentId)
  if (!container) return []
  return kind === 'folder'
    ? container.folders.map((n) => n.folder.id)
    : container.contacts.map((l) => l.id)
}

export function findFolder(tree: Tree, id: number): FolderNode | undefined {
  const stack = [...tree.folders]
  while (stack.length) {
    const node = stack.pop()!
    if (node.folder.id === id) return node
    stack.push(...node.folders)
  }
  return undefined
}

/** True if `folderId` is `candidateId` or one of its ancestors. */
export function isSelfOrAncestor(
  tree: Tree,
  folderId: number,
  candidateId: number,
): boolean {
  let current: number | null = candidateId
  while (current !== null) {
    if (current === folderId) return true
    current = findFolder(tree, current)?.folder.parentId ?? null
  }
  return false
}

// The tree as an import/export file (same order, no ids or timestamps).
export function toContactsFile(tree: Tree): ContactsFile {
  const contact = (c: Contact): ExportContact => ({
    name: c.name,
    ...(c.phone && { phone: c.phone }),
    ...(c.email && { email: c.email }),
    ...(c.address && { address: c.address }),
    ...(c.knownFrom && { knownFrom: c.knownFrom }),
    ...(c.description && { description: c.description }),
  })
  const folder = (node: FolderNode): ExportFolder => ({
    name: node.folder.name,
    folders: node.folders.map(folder),
    contacts: node.contacts.map(contact),
  })
  return {
    format: EXPORT_FORMAT,
    folders: tree.folders.map(folder),
    contacts: tree.contacts.map(contact),
  }
}

/** `tel:` link for a phone number as typed ("+31 6 1234 5678"). */
export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+#*,;]/g, '')}`
}

/** Google Maps search for an address (opens the maps app on phones). */
export function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** Names of the folders from the top level down to `folderId`. */
export function folderPath(tree: Tree, folderId: number | null) {
  const path: Array<string> = []
  let current = folderId
  while (current !== null) {
    const node = findFolder(tree, current)
    if (!node) break
    path.unshift(node.folder.name)
    current = node.folder.parentId
  }
  return path
}
