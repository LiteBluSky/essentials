import type { Folder, Password } from '@/db/schema'
import { EXPORT_FORMAT } from '@/lib/passwords/schemas'
import type {
  ExportFolder,
  ExportPassword,
  ImportFolder,
  ImportPassword,
  PasswordsFile,
  PasswordsImport,
} from '@/lib/passwords/schemas'
import type { Secret } from '@/lib/passwords/vault'

export type FolderNode = {
  folder: Folder
  folders: Array<FolderNode>
  passwords: Array<Password>
  /** Total passwords in this folder and all subfolders. */
  passwordCount: number
}

export type Tree = {
  folders: Array<FolderNode>
  passwords: Array<Password>
}

// Rows arrive pre-sorted by position from the server; grouping keeps that order.
export function buildTree(
  folders: Array<Folder>,
  passwords: Array<Password>,
): Tree {
  const nodes = new Map<number, FolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, {
      folder,
      folders: [],
      passwords: [],
      passwordCount: 0,
    })
  }

  const root: Tree = { folders: [], passwords: [] }
  for (const node of nodes.values()) {
    const parentId = node.folder.parentId
    const parent = parentId === null ? undefined : nodes.get(parentId)
    ;(parent ?? root).folders.push(node)
  }
  for (const password of passwords) {
    const parent =
      password.folderId === null ? undefined : nodes.get(password.folderId)
    ;(parent ?? root).passwords.push(password)
  }

  const count = (node: FolderNode): number => {
    node.passwordCount =
      node.passwords.length + node.folders.reduce((n, f) => n + count(f), 0)
    return node.passwordCount
  }
  root.folders.forEach(count)

  return root
}

function passwordMatches(password: Password, query: string) {
  return [password.name, password.username, password.url].some((value) =>
    value.toLowerCase().includes(query),
  )
}

// Keeps passwords that match, plus the folders leading to them. A folder whose own
// name matches keeps all of its contents.
export function filterTree(tree: Tree, rawQuery: string): Tree {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return tree

  const filterNode = (node: FolderNode): FolderNode | null => {
    if (node.folder.name.toLowerCase().includes(query)) return node
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const passwords = node.passwords.filter((l) => passwordMatches(l, query))
    if (!folders.length && !passwords.length) return null
    return { ...node, folders, passwords }
  }

  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    passwords: tree.passwords.filter((l) => passwordMatches(l, query)),
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

/** Ids of the folders or passwords directly under `parentId`, in display order. */
export function childIds(
  tree: Tree,
  kind: 'folder' | 'password',
  parentId: number | null,
): Array<number> {
  const container = parentId === null ? tree : findFolder(tree, parentId)
  if (!container) return []
  return kind === 'folder'
    ? container.folders.map((n) => n.folder.id)
    : container.passwords.map((l) => l.id)
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

// The tree as an import/export file (same order, no ids or timestamps),
// each secret opened with `open` (the vault must be unlocked): the file is
// unencrypted.
export function toPasswordsFile(
  tree: Tree,
  open: (sealed: string) => Secret,
): PasswordsFile {
  const password = (p: Password): ExportPassword => {
    const secret = open(p.secret)
    return {
      name: p.name,
      ...(p.username && { username: p.username }),
      ...(p.url && { url: p.url }),
      ...(secret.password && { password: secret.password }),
      ...(secret.notes && { notes: secret.notes }),
    }
  }
  const folder = (node: FolderNode): ExportFolder => ({
    name: node.folder.name,
    folders: node.folders.map(folder),
    passwords: node.passwords.map(password),
  })
  return {
    format: EXPORT_FORMAT,
    folders: tree.folders.map(folder),
    passwords: tree.passwords.map(password),
  }
}

/** The file as an import for the server: every secret sealed with `seal`. */
export function sealImport(
  file: PasswordsFile,
  seal: (secret: Secret) => string,
): PasswordsImport {
  const password = (p: ExportPassword): ImportPassword => ({
    name: p.name,
    username: p.username ?? '',
    url: p.url ?? '',
    secret: seal({ password: p.password ?? '', notes: p.notes ?? '' }),
  })
  const folder = (f: ExportFolder): ImportFolder => ({
    name: f.name,
    folders: f.folders.map(folder),
    passwords: f.passwords.map(password),
  })
  return {
    folders: file.folders.map(folder),
    passwords: file.passwords.map(password),
  }
}

/** A link to the site ("github.com" → https://github.com), or null. */
export function siteHref(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return null
  const href = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const parsed = new URL(href)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

/** "github.com" for a row's muted detail. */
export function siteLabel(url: string) {
  const href = siteHref(url)
  if (!href) return url
  return new URL(href).hostname.replace(/^www\./, '')
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
