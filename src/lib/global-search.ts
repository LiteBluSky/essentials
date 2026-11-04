// Global search (`z`) hands the picked item to its app's page: it stores the
// target here, navigates to the app, and the page (mounted or already
// showing) takes it with `useGlobalSearch` and opens / reveals it.

export type SearchApp = 'bookmarks' | 'notes' | 'tasks'

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
