import type { Folder, Link } from '@/db/schema'
import { EXPORT_FORMAT } from '@/lib/bookmarks/schemas'
import type {
  BookmarksFile,
  ExportFolder,
  ExportLink,
} from '@/lib/bookmarks/schemas'

export type FolderNode = {
  folder: Folder
  folders: Array<FolderNode>
  links: Array<Link>
  /** Total links in this folder and all subfolders. */
  linkCount: number
}

export type Tree = {
  folders: Array<FolderNode>
  links: Array<Link>
}

// Rows arrive pre-sorted by position from the server; grouping keeps that order.
export function buildTree(folders: Array<Folder>, links: Array<Link>): Tree {
  const nodes = new Map<number, FolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { folder, folders: [], links: [], linkCount: 0 })
  }

  const root: Tree = { folders: [], links: [] }
  for (const node of nodes.values()) {
    const parentId = node.folder.parentId
    const parent = parentId === null ? undefined : nodes.get(parentId)
    ;(parent ?? root).folders.push(node)
  }
  for (const link of links) {
    const parent = link.folderId === null ? undefined : nodes.get(link.folderId)
    ;(parent ?? root).links.push(link)
  }

  const count = (node: FolderNode): number => {
    node.linkCount =
      node.links.length + node.folders.reduce((n, f) => n + count(f), 0)
    return node.linkCount
  }
  root.folders.forEach(count)

  return root
}

function linkMatches(link: Link, query: string) {
  return [link.title, link.url, link.description ?? ''].some((value) =>
    value.toLowerCase().includes(query),
  )
}

// Keeps links that match, plus the folders leading to them. A folder whose own
// name matches keeps all of its contents.
export function filterTree(tree: Tree, rawQuery: string): Tree {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return tree

  const filterNode = (node: FolderNode): FolderNode | null => {
    if (node.folder.name.toLowerCase().includes(query)) return node
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const links = node.links.filter((l) => linkMatches(l, query))
    if (!folders.length && !links.length) return null
    return { ...node, folders, links }
  }

  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    links: tree.links.filter((l) => linkMatches(l, query)),
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

/** Favourite links in shortcut order (index 0 = key 1). */
export function favoriteLinks(links: Array<Link>): Array<Link> {
  return links
    .filter((l) => l.favoritePosition !== null)
    .sort((a, b) => a.favoritePosition! - b.favoritePosition!)
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** `ids` without `id`, then `id` inserted at `index` (clamped). */
export function reorderIds(ids: Array<number>, id: number, index: number) {
  const rest = ids.filter((x) => x !== id)
  const at = Math.min(Math.max(index, 0), rest.length)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** Ids of the folders or links directly under `parentId`, in display order. */
export function childIds(
  tree: Tree,
  kind: 'folder' | 'link',
  parentId: number | null,
): Array<number> {
  const container = parentId === null ? tree : findFolder(tree, parentId)
  if (!container) return []
  return kind === 'folder'
    ? container.folders.map((n) => n.folder.id)
    : container.links.map((l) => l.id)
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
export function toBookmarksFile(tree: Tree): BookmarksFile {
  const all: Array<Link> = [...tree.links]
  const stack = [...tree.folders]
  while (stack.length) {
    const node = stack.pop()!
    all.push(...node.links)
    stack.push(...node.folders)
  }
  const rank = new Map(favoriteLinks(all).map((l, i) => [l.id, i + 1]))

  const link = ({ id, title, url, description }: Link): ExportLink => ({
    title,
    url,
    ...(description && { description }),
    ...(rank.has(id) && { favorite: rank.get(id) }),
  })
  const folder = (node: FolderNode): ExportFolder => ({
    name: node.folder.name,
    folders: node.folders.map(folder),
    links: node.links.map(link),
  })
  return {
    format: EXPORT_FORMAT,
    folders: tree.folders.map(folder),
    links: tree.links.map(link),
  }
}
