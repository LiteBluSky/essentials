import { useEffect, useRef, useState } from 'react'

import { onTarget, takeTarget } from '@/lib/global-search'
import type { SearchApp } from '@/lib/global-search'

type FolderRow = { id: number; parentId: number | null }

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

// Focus a folder's row once it has rendered (its ancestors were just opened).
function focusFolderRow(id: number, tries = 5) {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(
      `[data-tree-item][data-kind="folder"][data-id="${id}"]`,
    )
    if (!row) {
      if (tries > 0) focusFolderRow(id, tries - 1)
      return
    }
    row.focus()
    row.scrollIntoView({ block: 'center' })
  })
}

/**
 * An app page's side of the global search: `z` opens it (while `enabled`,
 * i.e. no other dialog is open and not typing), and an item picked for this
 * app is opened (`openItem`) or, for a folder, revealed: the search is
 * cleared, the folder and its ancestors expanded and its row focused.
 */
export function useGlobalSearch({
  app,
  folders,
  setFolderOpen,
  clearSearch,
  openItem,
  enabled,
}: {
  app: SearchApp
  folders: Array<FolderRow>
  setFolderOpen: (id: number, open: boolean) => void
  clearSearch: () => void
  /** Opens an item of this app (bookmarks have none: links open directly). */
  openItem?: (id: number) => void
  enabled: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'z' || isTyping(e.target)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  // Always call the latest callbacks from the (stable) listener.
  const latest = useRef({ folders, setFolderOpen, clearSearch, openItem })
  latest.current = { folders, setFolderOpen, clearSearch, openItem }

  useEffect(() => {
    const handle = () => {
      const target = takeTarget(app)
      if (!target) return
      const { folders: all, ...actions } = latest.current
      if (target.kind === 'item') {
        actions.openItem?.(target.id)
        return
      }
      actions.clearSearch()
      let id: number | null = target.id
      while (id !== null) {
        actions.setFolderOpen(id, true)
        const current: number = id
        id = all.find((f) => f.id === current)?.parentId ?? null
      }
      focusFolderRow(target.id)
    }
    handle() // Picked from another app, which navigated here.
    return onTarget(handle)
  }, [app])

  return { open, setOpen }
}
