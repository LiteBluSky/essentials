import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'

import type { Note } from '@/db/schema'
import { useMoveItem } from '@/hooks/notes/use-move-item'
import type { MoveInput } from '@/lib/notes/schemas'
import { childIds, isSelfOrAncestor, reorderIds } from '@/lib/notes/tree'
import type { FolderNode, Tree } from '@/lib/notes/tree'

// Native HTML5 drag and drop for the tree. Folders and notes are ordered
// separately (folders always render first), so:
// - a folder can drop before/after another folder, or inside a folder
// - a note can drop before/after another note, or inside a folder
// - either can drop on the root zone to move to the end of the top level

export type DragItem = { kind: 'folder' | 'note'; id: number }
export type DropZone = 'before' | 'after' | 'inside'
export type DropTarget =
  | { kind: 'folder'; node: FolderNode }
  | { kind: 'note'; note: Note }
  | { kind: 'root' }

const EXPAND_DELAY_MS = 600

function targetKey(target: DropTarget) {
  if (target.kind === 'root') return 'root'
  return target.kind === 'folder'
    ? `folder:${target.node.folder.id}`
    : `note:${target.note.id}`
}

function zoneFor(
  drag: DragItem,
  target: DropTarget,
  e: DragEvent<HTMLElement>,
): DropZone | null {
  if (target.kind === 'root') return 'inside'
  if (target.kind === 'note') {
    if (drag.kind !== 'note') return null
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }
  if (drag.kind === 'note') return 'inside'
  const rect = e.currentTarget.getBoundingClientRect()
  const y = (e.clientY - rect.top) / rect.height
  return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside'
}

/** Turns a drop into a move, or null when invalid or a no-op. */
export function resolveMove(
  tree: Tree,
  drag: DragItem,
  target: DropTarget,
  zone: DropZone,
): MoveInput | null {
  let parentId: number | null
  let index: number

  if (target.kind === 'root' || zone === 'inside') {
    parentId = target.kind === 'folder' ? target.node.folder.id : null
    index = childIds(tree, drag.kind, parentId).filter(
      (x) => x !== drag.id,
    ).length
  } else {
    const siblingId =
      target.kind === 'folder' ? target.node.folder.id : target.note.id
    parentId =
      target.kind === 'folder'
        ? target.node.folder.parentId
        : target.note.folderId
    const siblings = childIds(tree, drag.kind, parentId).filter(
      (x) => x !== drag.id,
    )
    index = siblings.indexOf(siblingId) + (zone === 'after' ? 1 : 0)
  }

  if (
    drag.kind === 'folder' &&
    parentId !== null &&
    isSelfOrAncestor(tree, drag.id, parentId)
  ) {
    return null
  }

  const current = childIds(tree, drag.kind, parentId)
  const next = reorderIds(current, drag.id, index)
  const unchanged =
    current.includes(drag.id) && current.every((id, i) => id === next[i])
  if (unchanged) return null

  return { kind: drag.kind, id: drag.id, parentId, index }
}

type DndContextValue = {
  tree: Tree
  move: (move: MoveInput) => void
  enabled: boolean
  dragging: DragItem | null
  over: { key: string; zone: DropZone } | null
  start: (item: DragItem, e: DragEvent<HTMLElement>, text: string) => void
  end: () => void
  hover: (target: DropTarget, e: DragEvent<HTMLElement>) => void
  leave: (target: DropTarget, e: DragEvent<HTMLElement>) => void
  drop: (target: DropTarget, e: DragEvent<HTMLElement>) => void
}

const noop = () => {}

// Used when a row renders outside <TreeDndProvider> (e.g. mid hot-reload):
// rows still work, just without drag and drop.
const DISABLED: DndContextValue = {
  tree: { folders: [], notes: [] },
  move: noop,
  enabled: false,
  dragging: null,
  over: null,
  start: noop,
  end: noop,
  hover: noop,
  leave: noop,
  drop: noop,
}

const DndContext = createContext<DndContextValue>(DISABLED)

export function TreeDndProvider({
  tree,
  enabled,
  onExpand,
  children,
}: {
  tree: Tree
  enabled: boolean
  onExpand: (folderId: number) => void
  children: ReactNode
}) {
  const move = useMoveItem()
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [over, setOver] = useState<DndContextValue['over']>(null)
  const expandTimer = useRef<{ key: string; timer: number } | null>(null)

  const clearExpandTimer = () => {
    if (expandTimer.current) window.clearTimeout(expandTimer.current.timer)
    expandTimer.current = null
  }
  useEffect(() => clearExpandTimer, [])

  const end = () => {
    clearExpandTimer()
    setDragging(null)
    setOver(null)
  }

  const value: DndContextValue = {
    tree,
    move: (input) => move.mutate(input),
    enabled,
    dragging,
    over,
    start: (item, e, text) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', text)
      setDragging(item)
    },
    end,
    hover: (target, e) => {
      if (!dragging) return
      const zone = zoneFor(dragging, target, e)
      if (!zone || !resolveMove(tree, dragging, target, zone)) {
        if (over?.key === targetKey(target)) setOver(null)
        return
      }
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const key = targetKey(target)
      if (over?.key !== key || over.zone !== zone) setOver({ key, zone })

      // Hovering the middle of a closed folder opens it after a moment.
      if (target.kind === 'folder' && zone === 'inside') {
        if (expandTimer.current?.key !== key) {
          clearExpandTimer()
          const id = target.node.folder.id
          expandTimer.current = {
            key,
            timer: window.setTimeout(() => onExpand(id), EXPAND_DELAY_MS),
          }
        }
      } else {
        clearExpandTimer()
      }
    },
    leave: (target, e) => {
      const related = e.relatedTarget as Node | null
      if (related && e.currentTarget.contains(related)) return
      if (over?.key === targetKey(target)) setOver(null)
      if (expandTimer.current?.key === targetKey(target)) clearExpandTimer()
    },
    drop: (target, e) => {
      if (!dragging) return
      const zone = zoneFor(dragging, target, e)
      const resolved = zone && resolveMove(tree, dragging, target, zone)
      if (resolved) {
        e.preventDefault()
        e.stopPropagation()
        if (resolved.parentId !== null) onExpand(resolved.parentId)
        move.mutate(resolved)
      }
      end()
    },
  }

  return <DndContext value={value}>{children}</DndContext>
}

function useDnd() {
  return useContext(DndContext)
}

/** Props + state for a row that can be dragged and dropped onto. */
export function useTreeRowDnd(
  item: DragItem,
  target: DropTarget,
  dragText: string,
) {
  const dnd = useDnd()
  const key = targetKey(target)
  const dropZone = dnd.over?.key === key ? dnd.over.zone : undefined
  const isDragging =
    dnd.dragging?.kind === item.kind && dnd.dragging.id === item.id

  return {
    dropZone,
    isDragging,
    rowProps: {
      draggable: dnd.enabled,
      onDragStart: (e: DragEvent<HTMLElement>) => dnd.start(item, e, dragText),
      onDragEnd: dnd.end,
      onDragOver: (e: DragEvent<HTMLElement>) => dnd.hover(target, e),
      onDragLeave: (e: DragEvent<HTMLElement>) => dnd.leave(target, e),
      onDrop: (e: DragEvent<HTMLElement>) => dnd.drop(target, e),
    },
  }
}

/** Drop zone for moving an item to the end of the top level. */
export function useRootDrop() {
  const dnd = useDnd()
  const target: DropTarget = { kind: 'root' }
  return {
    visible: dnd.dragging !== null,
    active: dnd.over?.key === 'root',
    dropProps: {
      onDragOver: (e: DragEvent<HTMLElement>) => dnd.hover(target, e),
      onDragLeave: (e: DragEvent<HTMLElement>) => dnd.leave(target, e),
      onDrop: (e: DragEvent<HTMLElement>) => dnd.drop(target, e),
    },
  }
}

/**
 * Keyboard-friendly alternative to dragging: shift an item one place among
 * its siblings. Returns undefined when it can't move that way.
 */
export function useShiftItem(item: DragItem, parentId: number | null) {
  const dnd = useDnd()
  const siblings = childIds(dnd.tree, item.kind, parentId)
  const index = siblings.indexOf(item.id)
  const shift = (delta: -1 | 1) => {
    const next = index + delta
    if (index === -1 || next < 0 || next >= siblings.length) return undefined
    return () => dnd.move({ ...item, parentId, index: next })
  }
  return { up: shift(-1), down: shift(1) }
}
