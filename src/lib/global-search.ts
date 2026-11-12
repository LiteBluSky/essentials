import { z } from 'zod'

// Global search (`z`): the server returns at most SEARCH_LIMIT matches of
// each kind (per app: folders, items). Picking one hands it to its app's
// page: the target is stored here, the app navigated to, and the page
// (mounted or already showing) takes it with `useGlobalSearch` and opens /
// reveals it.

export const SEARCH_LIMIT = 20

export const searchInput = z.object({ query: z.string().trim().max(200) })

/** A reference to resolve (see `lib/references.ts`). */
export const referenceInput = z.object({
  app: z.enum(['bookmarks', 'notes', 'tasks', 'contacts']),
  id: z.number().int().positive().nullable(),
  name: z.string().max(500),
})
export type ReferenceInput = z.infer<typeof referenceInput>

export type SearchApp = 'bookmarks' | 'notes' | 'tasks' | 'contacts'

export type SearchResult = {
  kind: 'folder' | 'item'
  id: number
  label: string
  /** The containing folders, "A / B". */
  path: string
  /** Links open straight in a new tab. */
  url?: string
  done?: boolean
}

export type SearchResults = Record<SearchApp, Array<SearchResult>>

/** What to open: a folder is revealed in the tree, an item opened. (Links
 * open straight in a new tab, so they never get here.) */
export type SearchTarget = {
  app: SearchApp
  kind: 'folder' | 'item'
  id: number
}

let pending: SearchTarget | null = null
const listeners = new Set<() => void>()

export function requestOpen(target: SearchTarget) {
  pending = target
  listeners.forEach((listener) => listener())
}

/** The pending target if it's for `app` (and clears it). */
export function takeTarget(app: SearchApp): SearchTarget | null {
  if (pending?.app !== app) return null
  const target = pending
  pending = null
  return target
}

export function onTarget(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
