import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import type { TaskInput } from '@/lib/tasks/schemas'

// Vim-style motions over the visible tree rows (anywhere on the page, except
// while typing or with a dialog/menu open):
//   j / ↓  next row          k / ↑  previous row
//   h / ←  collapse folder, or jump to parent folder
//   l / →  expand folder, or step into its first child
//   H      collapse all folders; if none are open, go to the previous app
//   L      go to the next app
//   gg     first row         G      last row
//   n / N  next / previous visible task (wraps around)
//   o      open task / toggle folder (Enter works natively too)
//   r / e  edit the focused task, or rename / move the focused folder
//   a      new task in the hovered (or focused) folder, else top level
//   c      complete (or reopen) the hovered task, or the focused one
//   d      delete the hovered row (or the focused one), after confirming
//   t      show completed tasks / open tasks
//   v      folders / a flat list of tasks
//   i      calendar of the month
//   x      cut the focused task   p  paste it here   Esc  cancel the cut
//   1-9    open an "Up next" task
//   /      focus search       q  clear the search
//   ?      show keyboard shortcuts
//
// Rows opt in by putting these on their focusable element:
//   data-tree-item, data-kind="folder|task", data-id, data-parent-id
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
  onComplete,
  onToggleDone,
  onToggleLayout,
  onCut,
  onPaste,
  onCancelCut,
  onOpenUpNext,
  onCalendar,
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
  onEdit: (kind: 'folder' | 'task', id: number) => void
  onDelete: (kind: 'folder' | 'task', id: number) => void
  /** Previous (-1) / next (1) app in the navbar. */
  onSwitchApp: (step: -1 | 1) => void
  /** New task, pre-filled with this folder (null = top level). */
  onNew: (folderId: TaskInput['folderId']) => void
  onComplete: (taskId: number) => void
  onToggleDone: () => void
  onToggleLayout: () => void
  onCut: (taskId: number) => void
  /** Paste onto the focused row, or at the top level when none is focused. */
  onPaste: (target: { kind: 'folder' | 'task'; id: number } | null) => void
  /** Returns whether there was a cut to cancel. */
  onCancelCut: () => boolean
  /** `index` is 0-based (key 1 = 0). */
  onOpenUpNext: (index: number) => void
  onCalendar: () => void
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
    onComplete,
    onToggleDone,
    onToggleLayout,
    onCut,
    onPaste,
    onCancelCut,
    onOpenUpNext,
    onCalendar,
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
      // The hovered row wins over the focused one (for a, c and d).
      const pointed = () =>
        containerRef.current
          ?.querySelector(HOVERED_ROW)
          ?.querySelector<HTMLElement>(ITEM) ?? current

      if (/^[1-9]$/.test(e.key)) {
        handled()
        cb.onOpenUpNext(Number(e.key) - 1)
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
          const tasks = list.filter((el) => el.dataset.kind === 'task')
          if (!tasks.length) return
          handled()
          const at = (el: HTMLElement) => list.indexOf(el)
          focus(
            e.key === 'n'
              ? (tasks.find((el) => at(el) > index) ?? tasks[0])
              : ([...tasks]
                  .reverse()
                  .find((el) => index === -1 || at(el) < index) ??
                  tasks.at(-1)),
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
        case 'e':
          if (!current) return
          handled()
          cb.onEdit(isFolder ? 'folder' : 'task', id)
          return
        case 'd':
        case 'Delete': {
          const target = pointed()
          if (!target) return
          handled()
          cb.onDelete(
            target.dataset.kind === 'folder' ? 'folder' : 'task',
            Number(target.dataset.id),
          )
          return
        }
        case 'c': {
          const target = pointed()
          if (target?.dataset.kind !== 'task') return
          handled()
          cb.onComplete(Number(target.dataset.id))
          return
        }
        case 't':
          handled()
          cb.onToggleDone()
          return
        case 'v':
          handled()
          cb.onToggleLayout()
          return
        case 'i':
          handled()
          cb.onCalendar()
          return
        case 'x':
          if (!current || isFolder) return
          handled()
          cb.onCut(id)
          return
        case 'a': {
          // New task in the hovered (or focused) folder, or the folder of
          // the hovered task; the top level when nothing is pointed at.
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
        case 'p':
          handled()
          cb.onPaste(
            current ? { kind: isFolder ? 'folder' : 'task', id } : null,
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
