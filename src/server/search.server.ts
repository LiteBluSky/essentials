import { and, desc, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

import { db } from '@/db'
import {
  folders as bookmarkFolders,
  links,
  noteFolders,
  notes,
  taskFolders,
  tasks,
} from '@/db/schema'
import { SEARCH_LIMIT } from '@/lib/global-search'
import type { SearchResult, SearchResults } from '@/lib/global-search'
import { noteLabel } from '@/lib/notes/tree'

// Server-only DB helpers for the global search (shared by every app). Only
// import from search.functions.ts.

type Column = AnySQLiteColumn

// `like` is case-insensitive for ASCII in SQLite; % and _ in the search are
// matched literally.
function contains(column: Column, word: string) {
  const pattern = `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return sql`${column} like ${pattern} escape '\\'`
}

/** Every word appears in at least one of `columns`. */
function matchesAll(columns: Array<Column>, words: Array<string>) {
  return and(...words.map((w) => or(...columns.map((c) => contains(c, w)))))
}

/** Rows whose name matches every word come first, then the rest; most
 * recently edited first within each. No words: the latest edited. */
function ranking(name: Column, updatedAt: Column, words: Array<string>) {
  const order: Array<SQL> = [desc(updatedAt)]
  if (words.length) {
    order.unshift(sql`case when ${matchesAll([name], words)} then 0 else 1 end`)
  }
  return order
}

type FolderTable =
  typeof bookmarkFolders | typeof noteFolders | typeof taskFolders

// Each folder's path ("A / B"), from every folder of the app (a small table).
async function folderPaths(table: FolderTable) {
  const rows = await db
    .select({ id: table.id, name: table.name, parentId: table.parentId })
    .from(table)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const cache = new Map<number, string>()
  const path = (folderId: number | null): string => {
    if (folderId === null) return ''
    const cached = cache.get(folderId)
    if (cached !== undefined) return cached
    const folder = byId.get(folderId)
    if (!folder) return ''
    const parent = path(folder.parentId)
    const value = parent ? `${parent} / ${folder.name}` : folder.name
    cache.set(folderId, value)
    return value
  }
  return path
}

async function searchFolders(
  table: FolderTable,
  words: Array<string>,
  path: (id: number | null) => string,
): Promise<Array<SearchResult>> {
  const rows = await db
    .select({ id: table.id, name: table.name, parentId: table.parentId })
    .from(table)
    .where(words.length ? matchesAll([table.name], words) : undefined)
    .orderBy(...ranking(table.name, table.updatedAt, words))
    .limit(SEARCH_LIMIT)
  return rows.map((f) => ({
    kind: 'folder',
    id: f.id,
    label: f.name,
    path: path(f.parentId),
  }))
}

async function searchBookmarks(words: Array<string>) {
  const path = await folderPaths(bookmarkFolders)
  const [folders, items] = await Promise.all([
    searchFolders(bookmarkFolders, words, path),
    db
      .select({
        id: links.id,
        title: links.title,
        url: links.url,
        folderId: links.folderId,
      })
      .from(links)
      .where(
        words.length
          ? matchesAll([links.title, links.url, links.description], words)
          : undefined,
      )
      .orderBy(...ranking(links.title, links.updatedAt, words))
      .limit(SEARCH_LIMIT),
  ])
  return [
    ...folders,
    ...items.map((l): SearchResult => ({
      kind: 'item',
      id: l.id,
      label: l.title,
      path: path(l.folderId),
      url: l.url,
    })),
  ]
}

async function searchNotes(words: Array<string>) {
  const path = await folderPaths(noteFolders)
  const [folders, items] = await Promise.all([
    searchFolders(noteFolders, words, path),
    db
      .select({
        id: notes.id,
        title: notes.title,
        body: notes.body,
        folderId: notes.folderId,
      })
      .from(notes)
      .where(
        words.length ? matchesAll([notes.title, notes.body], words) : undefined,
      )
      .orderBy(...ranking(notes.title, notes.updatedAt, words))
      .limit(SEARCH_LIMIT),
  ])
  return [
    ...folders,
    ...items.map((n): SearchResult => ({
      kind: 'item',
      id: n.id,
      // The body only makes the label of an untitled note; not sent.
      label: noteLabel(n),
      path: path(n.folderId),
    })),
  ]
}

async function searchTasks(words: Array<string>) {
  const path = await folderPaths(taskFolders)
  const [folders, items] = await Promise.all([
    searchFolders(taskFolders, words, path),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        folderId: tasks.folderId,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(
        words.length
          ? matchesAll([tasks.title, tasks.description], words)
          : undefined,
      )
      .orderBy(...ranking(tasks.title, tasks.updatedAt, words))
      .limit(SEARCH_LIMIT),
  ])
  return [
    ...folders,
    ...items.map((t): SearchResult => ({
      kind: 'item',
      id: t.id,
      label: t.title,
      path: path(t.folderId),
      done: t.completedAt !== null,
    })),
  ]
}

/** Up to SEARCH_LIMIT folders and items per app matching every word of
 * `query` (in a name, URL, description or note body). */
export async function search(query: string): Promise<SearchResults> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const [bookmarks, notesFound, tasksFound] = await Promise.all([
    searchBookmarks(words),
    searchNotes(words),
    searchTasks(words),
  ])
  return { bookmarks, notes: notesFound, tasks: tasksFound }
}
