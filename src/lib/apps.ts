import {
  BookmarkIcon,
  CalendarDaysIcon,
  ContactRoundIcon,
  EuroIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The apps bundled into this one, in navbar order. Adding an app: give it a
// route at `path`, an entry here, and its own namespaced components / hooks /
// lib / server files (see bookmarks, notes, tasks and contacts).
export const APPS = [
  { path: '/bookmarks', name: 'Bookmarks', icon: BookmarkIcon },
  { path: '/notes', name: 'Notes', icon: NotebookPenIcon },
  { path: '/tasks', name: 'Tasks', icon: ListChecksIcon },
  { path: '/calendar', name: 'Calendar', icon: CalendarDaysIcon },
  { path: '/contacts', name: 'Contacts', icon: ContactRoundIcon },
  { path: '/finances', name: 'Finances', icon: EuroIcon },
  { path: '/chat', name: 'Chat', icon: MessagesSquareIcon },
] as const satisfies ReadonlyArray<{
  path: string
  name: string
  icon: LucideIcon
}>

export type AppPath = (typeof APPS)[number]['path']
