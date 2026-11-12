import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FolderIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { SearchApp, SearchResult } from '@/lib/global-search'
import { cn } from '@/lib/utils'
import { globalSearch } from '@/server/search.functions'

type Entry = SearchResult & { app: SearchApp }

const DEBOUNCE_MS = 150

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/**
 * Search across every app's folders and items (`z`, or the header's search
 * button). The server does the matching and sends at most 20 folders and 20
 * items per app (the latest edited while the search is empty), refined as
 * you type. Picking a link opens it in a new tab; anything else switches to
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
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim(), DEBOUNCE_MS)
  const results = useQuery({
    queryKey: ['search', search],
    queryFn: () => globalSearch({ data: { query: search } }),
    enabled: open,
    // Keep showing the last results while the next ones load.
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const groups = useMemo(() => {
    const out: Record<SearchApp, Array<Entry>> = {
      bookmarks: [],
      notes: [],
      tasks: [],
    }
    if (!results.data) return out
    for (const app of Object.keys(out) as Array<SearchApp>) {
      out[app] = results.data[app].map((r) => ({ ...r, app }))
    }
    return out
  }, [results.data])

  // Acted on once the dialog is gone, and the dialog doesn't hand focus back
  // to what opened it (the app opens or focuses the pick). The flag is only
  // reset once it has opened again: Base UI may restore focus after
  // onOpenChangeComplete.
  const picked = useRef<Entry | null>(null)
  const returnFocus = useRef(true)
  const pick = (entry: Entry) => {
    if (entry.url) {
      // Right away: popup blockers only allow it during the click / key.
      window.open(entry.url, '_blank', 'noreferrer')
    } else {
      picked.current = entry
      returnFocus.current = false
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) returnFocus.current = true
        if (!isOpen) setQuery('')
        const entry = picked.current
        if (isOpen || !entry) return
        picked.current = null
        // After the popup has unmounted and any focus handling is done.
        setTimeout(() => {
          requestOpen({ app: entry.app, kind: entry.kind, id: entry.id })
          void navigate({ to: `/${entry.app}` })
        })
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
        finalFocus={() => returnFocus.current}
      >
        {/* The server filters and ranks; cmdk only handles the keys. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search bookmarks, notes and tasks…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-96">
            <CommandEmpty>
              {results.isPending || query.trim() !== search ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Searching…
                </span>
              ) : (
                'Nothing found.'
              )}
            </CommandEmpty>
            {APPS.map((app) => {
              const key = app.path.slice(1) as SearchApp
              // Apps with nothing to search (Chat) have no group.
              const entries = Object.hasOwn(groups, key) ? groups[key] : []
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
      onSelect={onSelect}
    >
      <Icon />
      {/* One full-width row, so the path sits at the right edge (the item's
          hidden check icon would otherwise split the space with it). */}
      <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <span
          className={cn(
            'truncate',
            entry.done && 'text-muted-foreground line-through',
          )}
        >
          {entry.label}
        </span>
        {entry.path && (
          <span className="max-w-1/2 shrink-0 truncate text-xs text-muted-foreground">
            {entry.path}
          </span>
        )}
      </span>
    </CommandItem>
  )
}
