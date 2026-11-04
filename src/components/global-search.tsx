import { useQueries } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FolderIcon } from 'lucide-react'
import { useMemo, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { APPS } from '@/lib/apps'
import { requestOpen } from '@/lib/global-search'
import type { SearchApp } from '@/lib/global-search'
import { noteLabel } from '@/lib/notes/tree'
import { cn } from '@/lib/utils'
import { bookmarksTreeQueryOptions } from '@/server/bookmarks.functions'
import { notesTreeQueryOptions } from '@/server/notes.functions'
import { tasksTreeQueryOptions } from '@/server/tasks.functions'

type FolderRow = { id: number; name: string; parentId: number | null }

type Entry = {
  app: SearchApp
  kind: 'folder' | 'item'
  id: number
  label: string
  /** The containing folders, "A / B". */
  path: string
  /** Searched too, not shown (a note's body, a task's description, a URL). */
  extra: string
  /** Links open straight in a new tab. */
  url?: string
  done?: boolean
}

function pathsOf(folders: Array<FolderRow>) {
  const byId = new Map(folders.map((f) => [f.id, f]))
  return (folderId: number | null) => {
    const names: Array<string> = []
    let current = folderId === null ? undefined : byId.get(folderId)
    while (current) {
      names.unshift(current.name)
      current =
        current.parentId === null ? undefined : byId.get(current.parentId)
    }
    return names.join(' / ')
  }
}

function folderEntries(app: SearchApp, folders: Array<FolderRow>) {
  const path = pathsOf(folders)
  return {
    path,
    entries: folders.map((f): Entry => ({
      app,
      kind: 'folder',
      id: f.id,
      label: f.name,
      path: path(f.parentId),
      extra: '',
    })),
  }
}

// Every search word must appear in the label, path or extra text; matches in
// the label rank first.
function filterEntries(
  _value: string,
  search: string,
  keywords?: Array<string>,
) {
  const [label = '', rest = ''] = (keywords ?? []).map((k) => k.toLowerCase())
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  if (!words.every((w) => label.includes(w) || rest.includes(w))) return 0
  return words.every((w) => label.includes(w)) ? 1 : 0.5
}

/**
 * Search across every app's folders and items (`z`, or the header's search
 * button). Picking a link opens it in a new tab; anything else switches to
 * its app and opens it there (a folder is revealed in the tree).
 */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [bookmarks, notes, tasks] = useQueries({
    queries: [
      { ...bookmarksTreeQueryOptions, enabled: open },
      { ...notesTreeQueryOptions, enabled: open },
      { ...tasksTreeQueryOptions, enabled: open },
    ],
  })

  const groups = useMemo(() => {
    const out: Record<SearchApp, Array<Entry>> = {
      bookmarks: [],
      notes: [],
      tasks: [],
    }
    if (bookmarks.data) {
      const { path, entries } = folderEntries(
        'bookmarks',
        bookmarks.data.folders,
      )
      out.bookmarks = [
        ...entries,
        ...bookmarks.data.links.map((l): Entry => ({
          app: 'bookmarks',
          kind: 'item',
          id: l.id,
          label: l.title,
          path: path(l.folderId),
          extra: `${l.url} ${l.description ?? ''}`,
          url: l.url,
        })),
      ]
    }
    if (notes.data) {
      const { path, entries } = folderEntries('notes', notes.data.folders)
      out.notes = [
        ...entries,
        ...notes.data.notes.map((n): Entry => ({
          app: 'notes',
          kind: 'item',
          id: n.id,
          label: noteLabel(n),
          path: path(n.folderId),
          extra: n.body,
        })),
      ]
    }
    if (tasks.data) {
      const { path, entries } = folderEntries('tasks', tasks.data.folders)
      out.tasks = [
        ...entries,
        ...tasks.data.tasks.map((t): Entry => ({
          app: 'tasks',
          kind: 'item',
          id: t.id,
          label: t.title,
          path: path(t.folderId),
          extra: t.description,
          done: t.completedAt !== null,
        })),
      ]
    }
    return out
  }, [bookmarks.data, notes.data, tasks.data])

  const loading = bookmarks.isPending || notes.isPending || tasks.isPending

  // Acted on once the dialog has closed, so it doesn't take focus back from
  // what the app opens or focuses.
  const picked = useRef<Entry | null>(null)
  const pick = (entry: Entry) => {
    if (entry.url) {
      // Right away: popup blockers only allow it during the click / key.
      window.open(entry.url, '_blank', 'noreferrer')
    } else {
      picked.current = entry
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        const entry = picked.current
        if (isOpen || !entry) return
        picked.current = null
        requestOpen({ app: entry.app, kind: entry.kind, id: entry.id })
        void navigate({ to: `/${entry.app}` })
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Search everything</DialogTitle>
        <DialogDescription>
          Find any folder, bookmark, note or task.
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
        finalFocus={() => picked.current === null}
      >
        <Command filter={filterEntries}>
          <CommandInput placeholder="Search bookmarks, notes and tasks…" />
          <CommandList className="max-h-96">
            <CommandEmpty>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Loading…
                </span>
              ) : (
                'Nothing found.'
              )}
            </CommandEmpty>
            {APPS.map((app) => {
              const key = app.path.slice(1) as SearchApp
              const entries = groups[key]
              if (!entries.length) return null
              return (
                <CommandGroup key={key} heading={app.name}>
                  {entries.map((entry) => (
                    <SearchItem
                      key={`${entry.kind}:${entry.id}`}
                      entry={entry}
                      icon={entry.kind === 'folder' ? FolderIcon : app.icon}
                      onSelect={() => pick(entry)}
                    />
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function SearchItem({
  entry,
  icon: Icon,
  onSelect,
}: {
  entry: Entry
  icon: LucideIcon
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={`${entry.app}:${entry.kind}:${entry.id}`}
      keywords={[entry.label, `${entry.path} ${entry.extra}`]}
      onSelect={onSelect}
    >
      <Icon />
      <span
        className={cn(
          'truncate',
          entry.done && 'text-muted-foreground line-through',
        )}
      >
        {entry.label}
      </span>
      {entry.path && (
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {entry.path}
        </span>
      )}
    </CommandItem>
  )
}
