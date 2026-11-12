import type { Folder, Note } from '@/db/schema'
import { EXPORT_FORMAT } from '@/lib/notes/schemas'
import { plainReferences } from '@/lib/references'
import type { ExportFolder, ExportNote, NotesFile } from '@/lib/notes/schemas'

export type FolderNode = {
  folder: Folder
  folders: Array<FolderNode>
  notes: Array<Note>
  /** Total notes in this folder and all subfolders. */
  noteCount: number
}

export type Tree = {
  folders: Array<FolderNode>
  notes: Array<Note>
}

// Rows arrive pre-sorted by position from the server; grouping keeps that order.
export function buildTree(folders: Array<Folder>, notes: Array<Note>): Tree {
  const nodes = new Map<number, FolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { folder, folders: [], notes: [], noteCount: 0 })
  }

  const root: Tree = { folders: [], notes: [] }
  for (const node of nodes.values()) {
    const parentId = node.folder.parentId
    const parent = parentId === null ? undefined : nodes.get(parentId)
    ;(parent ?? root).folders.push(node)
  }
  for (const note of notes) {
    const parent = note.folderId === null ? undefined : nodes.get(note.folderId)
    ;(parent ?? root).notes.push(note)
  }

  const count = (node: FolderNode): number => {
    node.noteCount =
      node.notes.length + node.folders.reduce((n, f) => n + count(f), 0)
    return node.noteCount
  }
  root.folders.forEach(count)

  return root
}

function noteMatches(note: Note, query: string) {
  return [note.title, note.body].some((value) =>
    value.toLowerCase().includes(query),
  )
}

// Keeps notes that match, plus the folders leading to them. A folder whose own
// name matches keeps all of its contents.
export function filterTree(tree: Tree, rawQuery: string): Tree {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return tree

  const filterNode = (node: FolderNode): FolderNode | null => {
    if (node.folder.name.toLowerCase().includes(query)) return node
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const notes = node.notes.filter((n) => noteMatches(n, query))
    if (!folders.length && !notes.length) return null
    return { ...node, folders, notes }
  }

  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    notes: tree.notes.filter((n) => noteMatches(n, query)),
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

/** How many notes each of "Recent" and "Most viewed" lists. */
export const QUICK_COUNT = 4

/**
 * The quick-access lists above the search: the last opened notes, then the
 * most opened ones that aren't already in "Recent". Keys 1-4 open the
 * recent ones, 5-8 the most viewed.
 */
export function quickNotes(notes: Array<Note>) {
  const opened = notes.filter((n) => n.openedAt !== null)
  const time = (n: Note) => n.openedAt?.getTime() ?? 0
  const recent = [...opened]
    .sort((a, b) => time(b) - time(a))
    .slice(0, QUICK_COUNT)
  const inRecent = new Set(recent.map((n) => n.id))
  const popular = opened
    .filter((n) => !inRecent.has(n.id))
    .sort((a, b) => b.viewCount - a.viewCount || time(b) - time(a))
    .slice(0, QUICK_COUNT)
  return { recent, popular }
}

// Plain text of the first lines of a markdown body, for lists and tooltips.
export function noteSnippet(body: string, max = 140) {
  const text = plainReferences(body)
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/, '')
        .replace(/^\[[ xX]\]\s+/, ''),
    )
    .filter((line) => line.trim() && !/^(?:[-*_]\s*){3,}$|^```/.test(line))
    .join(' · ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** What a note is called in lists: its title, else the start of its text. */
export function noteLabel(note: Pick<Note, 'title' | 'body'>) {
  return note.title || noteSnippet(note.body, 80) || 'Empty note'
}

export function isNoteEmpty(note: Pick<Note, 'title' | 'body'>) {
  return !note.title.trim() && !note.body.trim()
}

/** `ids` without `id`, then `id` inserted at `index` (clamped). */
export function reorderIds(ids: Array<number>, id: number, index: number) {
  const rest = ids.filter((x) => x !== id)
  const at = Math.min(Math.max(index, 0), rest.length)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** Ids of the folders or notes directly under `parentId`, in display order. */
export function childIds(
  tree: Tree,
  kind: 'folder' | 'note',
  parentId: number | null,
): Array<number> {
  const container = parentId === null ? tree : findFolder(tree, parentId)
  if (!container) return []
  return kind === 'folder'
    ? container.folders.map((n) => n.folder.id)
    : container.notes.map((n) => n.id)
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

/** Folder names from the top level down to `folderId` (empty at root). */
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
export function toNotesFile(tree: Tree): NotesFile {
  const note = ({ title, body }: Note): ExportNote => ({
    ...(title && { title }),
    body,
  })
  const folder = (node: FolderNode): ExportFolder => ({
    name: node.folder.name,
    folders: node.folders.map(folder),
    notes: node.notes.map(note),
  })
  return {
    format: EXPORT_FORMAT,
    folders: tree.folders.map(folder),
    notes: tree.notes.map(note),
  }
}
