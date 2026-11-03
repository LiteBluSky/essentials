import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

// Vim-style motions over the visible tree rows (anywhere on the page, except
// while typing or with a dialog/menu open):
//   j / ↓  next row          k / ↑  previous row
//   h / ←  collapse folder, or jump to parent folder
//   l / →  expand folder, or step into its first child
//   H      collapse all folders; if none are open, go to the previous app
//   L      go to the next app
//   gg     first row         G      last row
//   n / N  next / previous visible link (wraps around)
//   o      open link / toggle folder (Enter works natively too)
//   r      edit (rename / move) the focused folder or link
//   a      new link in the hovered (or focused) folder
//   d      delete the hovered row (or the focused one), after confirming
//   x      cut the focused link   p  paste it here   Esc  cancel the cut
//   f      add/remove the hovered (or focused) link as a favourite
//   1-9    open that favourite in a new tab
//   /      focus search       q  clear the search
//   ?      show keyboard shortcuts
//
// Rows opt in by putting these on their focusable element:
//   data-tree-item, data-kind="folder|link", data-id, data-parent-id
// (data-parent-id is "" at the top level). The row's hover area (the element
// that also holds its menu) is marked with data-tree-row.

const ITEM = '[data-tree-item]'
const HOVERED_ROW = '[data-tree-row]:hover'
const GG_TIMEOUT_MS = 500

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"]')
  )
}

export function useTreeKeyboard({
  containerRef,
  expanded,
  setOpen,
  collapseAll,
  onSearch,
  onClearSearch,
  onHelp,
  onEdit,
  onDelete,
  onSwitchApp,
  onNew,
  onCut,
  onPaste,
  onCancelCut,
  onToggleFavorite,
  onOpenFavorite,
  enabled,
}: {
  containerRef: RefObject<HTMLElement | null>
  expanded: ReadonlySet<number>
  setOpen: (id: number, open: boolean) => void
  collapseAll: () => void
  onSearch: () => void
  /** Returns whether there was a search to clear. */
  onClearSearch: () => boolean
  onHelp: () => void
  onEdit: (kind: 'folder' | 'link', id: number) => void
  onDelete: (kind: 'folder' | 'link', id: number) => void
  /** Previous (-1) / next (1) app in the navbar. */
  onSwitchApp: (step: -1 | 1) => void
  /** New link, pre-filled with this folder (null = top level). */
  onNew: (folderId: number | null) => void
  onCut: (linkId: number) => void
  /** Paste onto the focused row, or at the top level when none is focused. */
  onPaste: (target: { kind: 'folder' | 'link'; id: number } | null) => void
  /** Returns whether there was a cut to cancel. */
  onCancelCut: () => boolean
  onToggleFavorite: (linkId: number) => void
  /** `index` is 0-based (key 1 = 0). */
  onOpenFavorite: (index: number) => void
  enabled: boolean
}) {
  const callbacks = {
    expanded,
    setOpen,
    collapseAll,
    onSearch,
    onClearSearch,
    onHelp,
    onEdit,
    onDelete,
    onSwitchApp,
    onNew,
    onCut,
    onPaste,
    onCancelCut,
    onToggleFavorite,
    onOpenFavorite,
  }
  const latest = useRef(callbacks)
  useEffect(() => {
    latest.current = callbacks
  })

  useEffect(() => {
    if (!enabled) return
    let lastG = 0

    const items = () =>
      Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [],
      ).filter((el) => el.offsetParent !== null)

    const focus = (el: HTMLElement | undefined) => {
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'nearest' })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      const active = document.activeElement
      if (active instanceof HTMLElement && active.closest('[role="menu"]')) {
        return
      }

      const list = items()
      const current =
        active instanceof HTMLElement && active.matches(ITEM)
          ? active
          : undefined
      const index = current ? list.indexOf(current) : -1
      const id = Number(current?.dataset.id)
      const isFolder = current?.dataset.kind === 'folder'
      const cb = latest.current

      const handled = () => e.preventDefault()
      // The hovered row wins over the focused one (for d and f).
      const pointed = () =>
        containerRef.current
          ?.querySelector(HOVERED_ROW)
          ?.querySelector<HTMLElement>(ITEM) ?? current

      if (/^[1-9]$/.test(e.key)) {
        handled()
        cb.onOpenFavorite(Number(e.key) - 1)
        return
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          handled()
          focus(list[Math.min(index + 1, list.length - 1)])
          return
        case 'k':
        case 'ArrowUp':
          handled()
          focus(index === -1 ? list[0] : list[Math.max(index - 1, 0)])
          return
        case 'n':
        case 'N': {
          const links = list.filter((el) => el.dataset.kind === 'link')
          if (!links.length) return
          handled()
          const at = (el: HTMLElement) => list.indexOf(el)
          focus(
            e.key === 'n'
              ? (links.find((el) => at(el) > index) ?? links[0])
              : ([...links]
                  .reverse()
                  .find((el) => index === -1 || at(el) < index) ??
                  links.at(-1)),
          )
          return
        }
        case 'G':
          handled()
          focus(list.at(-1))
          return
        case 'g': {
          handled()
          const now = Date.now()
          if (now - lastG < GG_TIMEOUT_MS) {
            focus(list[0])
            lastG = 0
          } else {
            lastG = now
          }
          return
        }
        case 'H': {
          handled()
          const anyOpen = list.some(
            (el) =>
              el.dataset.kind === 'folder' &&
              cb.expanded.has(Number(el.dataset.id)),
          )
          if (!anyOpen) {
            cb.onSwitchApp(-1)
            return
          }
          // Keep focus visible: move it to the row's top-level folder.
          let top = current
          while (top?.dataset.parentId) {
            const parentId = top.dataset.parentId
            top = list.find(
              (el) =>
                el.dataset.kind === 'folder' && el.dataset.id === parentId,
            )
          }
          cb.collapseAll()
          if (top && top !== current) focus(top)
          return
        }
        case 'L':
          handled()
          cb.onSwitchApp(1)
          return
        case 'h':
        case 'ArrowLeft': {
          if (!current) return
          handled()
          if (isFolder && cb.expanded.has(id)) {
            cb.setOpen(id, false)
            return
          }
          const parentId = current.dataset.parentId
          if (parentId) {
            focus(
              list.find(
                (el) =>
                  el.dataset.kind === 'folder' && el.dataset.id === parentId,
              ),
            )
          }
          return
        }
        case 'l':
        case 'ArrowRight': {
          if (!current || !isFolder) return
          handled()
          if (!cb.expanded.has(id)) {
            cb.setOpen(id, true)
            return
          }
          const next = list.at(index + 1)
          if (next?.dataset.parentId === String(id)) focus(next)
          return
        }
        case 'o':
          if (!current) return
          handled()
          current.click()
          return
        case 'r':
          if (!current) return
          handled()
          cb.onEdit(isFolder ? 'folder' : 'link', id)
          return
        case 'd': {
          const target = pointed()
          if (!target) return
          handled()
          cb.onDelete(
            target.dataset.kind === 'folder' ? 'folder' : 'link',
            Number(target.dataset.id),
          )
          return
        }
        case 'x':
          if (!current || isFolder) return
          handled()
          cb.onCut(id)
          return
        case 'a': {
          // New link in the hovered (or focused) folder, or the folder of
          // the hovered link; top level when nothing is pointed at.
          const target = pointed()
          handled()
          cb.onNew(
            !target
              ? null
              : target.dataset.kind === 'folder'
                ? Number(target.dataset.id)
                : target.dataset.parentId
                  ? Number(target.dataset.parentId)
                  : null,
          )
          return
        }
        case 'f': {
          const target = pointed()
          if (target?.dataset.kind !== 'link') return
          handled()
          cb.onToggleFavorite(Number(target.dataset.id))
          return
        }
        case 'p':
          handled()
          cb.onPaste(
            current ? { kind: isFolder ? 'folder' : 'link', id } : null,
          )
          return
        case 'Escape':
          if (cb.onCancelCut()) handled()
          return
        case 'q':
          if (cb.onClearSearch()) handled()
          return
        case '/':
          handled()
          cb.onSearch()
          return
        case '?':
          handled()
          cb.onHelp()
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, containerRef])
}
