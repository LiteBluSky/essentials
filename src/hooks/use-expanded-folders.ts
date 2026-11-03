import { useCallback, useEffect, useState } from 'react'

// Remembers which folders are open across reloads, per app (`app` keys the
// storage: `<app>:expanded-folders`). Starts empty on the server
// and on first client render, then restores from localStorage after hydration.
export function useExpandedFolders(app: string) {
  const storageKey = `${app}:expanded-folders`
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) setExpanded(new Set(JSON.parse(stored) as Array<number>))
    } catch {
      // Unavailable or corrupt storage — start collapsed.
    }
  }, [storageKey])

  const update = useCallback(
    (change: (prev: ReadonlySet<number>) => ReadonlySet<number>) => {
      setExpanded((prev) => {
        const next = change(prev)
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]))
        } catch {
          // Ignore — expansion just won't persist.
        }
        return next
      })
    },
    [storageKey],
  )

  const setOpen = useCallback(
    (id: number, open: boolean) =>
      update((prev) => {
        const next = new Set(prev)
        if (open) next.add(id)
        else next.delete(id)
        return next
      }),
    [update],
  )

  const collapseAll = useCallback(() => update(() => new Set()), [update])

  return { expanded, setOpen, collapseAll }
}
