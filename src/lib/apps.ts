import { BookmarkIcon, ListChecksIcon, NotebookPenIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The apps bundled into this one, in navbar order. Adding an app: give it a
// route at `path`, an entry here, and its own namespaced components / hooks /
// lib / server files (see bookmarks, notes and tasks).
export const APPS = [
  { path: '/bookmarks', name: 'Bookmarks', icon: BookmarkIcon },
  { path: '/notes', name: 'Notes', icon: NotebookPenIcon },
  { path: '/tasks', name: 'Tasks', icon: ListChecksIcon },
] as const satisfies ReadonlyArray<{
  path: string
  name: string
  icon: LucideIcon
}>

export type AppPath = (typeof APPS)[number]['path']
