import { GripVerticalIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type {
  DragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { Contact } from '@/db/schema'
import { useMoveItem } from '@/hooks/contacts/use-move-item'
import type { MoveInput } from '@/lib/contacts/schemas'
import { childIds, isSelfOrAncestor, reorderIds } from '@/lib/contacts/tree'
import type { FolderNode, Tree } from '@/lib/contacts/tree'

// Native HTML5 drag and drop for the tree. Folders and contacts are ordered
// separately (folders always render first), so:
// - a folder can drop before/after another folder, or inside a folder
// - a contact can drop before/after another contact, or inside a folder
// - either can drop on the root zone to move to the end of the top level

export type DragItem = { kind: 'folder' | 'contact'; id: number }
export type DropZone = 'before' | 'after' | 'inside'
export type DropTarget =
  | { kind: 'folder'; node: FolderNode }
  | { kind: 'contact'; contact: Contact }
  | { kind: 'root' }

const EXPAND_DELAY_MS = 600
/** Touch drags scroll the page this close (px) to its top / bottom. */
const SCROLL_EDGE = 72

// Touch screens have no native drag and drop: there each row has a grip
// (`DragHandle`, shown on coarse pointers only) that drags with the finger
// (pointer events; the row under it is found with `elementFromPoint` and
// its `data-dnd-key`), with the same zones, checks and move, a label
// following the finger, and the page scrolling near its top / bottom.

function targetKey(target: DropTarget) {
  if (target.kind === 'root') return 'root'
  return target.kind === 'folder'
    ? `folder:${target.node.folder.id}`
    : `contact:${target.contact.id}`
}

function zoneFor(
  drag: DragItem,
  target: DropTarget,
  rect: DOMRect,
  clientY: number,
): DropZone | null {
  if (target.kind === 'root') return 'inside'
  if (target.kind === 'contact') {
    if (drag.kind !== 'contact') return null
    return clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }
  if (drag.kind === 'contact') return 'inside'
  const y = (clientY - rect.top) / rect.height
  return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside'
}

const zoneOf = (
  drag: DragItem,
  target: DropTarget,
  e: DragEvent<HTMLElement>,
) => zoneFor(drag, target, e.currentTarget.getBoundingClientRect(), e.clientY)

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
      target.kind === 'folder' ? target.node.folder.id : target.contact.id
    parentId =
      target.kind === 'folder'
        ? target.node.folder.parentId
        : target.contact.folderId
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
  /** Rows register their drop target under their `data-dnd-key`. */
  register: (key: string, target: DropTarget) => void
  touchStart: (item: DragItem, e: ReactPointerEvent, text: string) => void
}

const noop = () => {}

// Used when a row renders outside <TreeDndProvider> (e.g. mid hot-reload):
// rows still work, just without drag and drop.
const DISABLED: DndContextValue = {
  tree: { folders: [], contacts: [] },
  move: noop,
  enabled: false,
  dragging: null,
  over: null,
  start: noop,
  end: noop,
  hover: noop,
  leave: noop,
  drop: noop,
  register: noop,
  touchStart: noop,
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
    setTouch(null)
  }

  // Shared by mouse and touch: shows where it would land (or nothing), and
  // opens a closed folder held over its middle after a moment.
  const hoverAt = (target: DropTarget, zone: DropZone | null) => {
    if (!dragging) return false
    if (!zone || !resolveMove(tree, dragging, target, zone)) {
      if (over?.key === targetKey(target)) setOver(null)
      clearExpandTimer()
      return false
    }
    const key = targetKey(target)
    if (over?.key !== key || over.zone !== zone) setOver({ key, zone })
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
    return true
  }

  const dropAt = (target: DropTarget, zone: DropZone | null) => {
    if (!dragging || !zone) return false
    const resolved = resolveMove(tree, dragging, target, zone)
    if (!resolved) return false
    if (resolved.parentId !== null) onExpand(resolved.parentId)
    move.mutate(resolved)
    return true
  }

  // Touch dragging: the drop targets by key, where the finger is and the
  // label following it.
  const targets = useRef(new Map<string, DropTarget>())
  const [touch, setTouch] = useState<{
    x: number
    y: number
    text: string
  } | null>(null)
  const touchRef = useRef(touch)
  touchRef.current = touch
  const draggingRef = useRef(dragging)
  draggingRef.current = dragging
  const latest = useRef({ hoverAt, dropAt, end })
  latest.current = { hoverAt, dropAt, end }
  const touching = touch !== null
  useEffect(() => {
    if (!touching) return
    const zoneAt = (x: number, y: number) => {
      const el = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>('[data-dnd-key]')
      const target = el ? targets.current.get(el.dataset.dndKey ?? '') : null
      const drag = draggingRef.current
      if (!el || !target || !drag) return null
      return {
        target,
        zone: zoneFor(drag, target, el.getBoundingClientRect(), y),
      }
    }
    const onMove = (e: PointerEvent) => {
      setTouch((t) => t && { ...t, x: e.clientX, y: e.clientY })
      const at = zoneAt(e.clientX, e.clientY)
      if (at) latest.current.hoverAt(at.target, at.zone)
      else setOver(null)
    }
    const onUp = (e: PointerEvent) => {
      const at = zoneAt(e.clientX, e.clientY)
      if (at) latest.current.dropAt(at.target, at.zone)
      latest.current.end()
    }
    const onCancel = () => latest.current.end()
    // Near the top / bottom the page scrolls (the grip keeps the browser
    // from scrolling while dragging).
    let frame = 0
    const scroll = () => {
      const t = touchRef.current
      if (t) {
        if (t.y < SCROLL_EDGE) window.scrollBy(0, -8)
        else if (t.y > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, 8)
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [touching])

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
      if (!hoverAt(target, zoneOf(dragging, target, e))) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
    },
    leave: (target, e) => {
      const related = e.relatedTarget as Node | null
      if (related && e.currentTarget.contains(related)) return
      if (over?.key === targetKey(target)) setOver(null)
      if (expandTimer.current?.key === targetKey(target)) clearExpandTimer()
    },
    drop: (target, e) => {
      if (!dragging) return
      if (dropAt(target, zoneOf(dragging, target, e))) {
        e.preventDefault()
        e.stopPropagation()
      }
      end()
    },
    register: (key, target) => {
      targets.current.set(key, target)
    },
    touchStart: (item, e, text) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(item)
      setTouch({ x: e.clientX, y: e.clientY, text })
    },
  }

  return (
    <DndContext value={value}>
      {children}
      {touch && (
        <Badge
          aria-hidden
          className="pointer-events-none fixed z-50 max-w-60 -translate-x-1/2 -translate-y-[150%] truncate shadow-md"
          style={{ left: touch.x, top: touch.y }}
        >
          {touch.text}
        </Badge>
      )}
    </DndContext>
  )
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
  dnd.register(key, target)
  const dropZone = dnd.over?.key === key ? dnd.over.zone : undefined
  const isDragging =
    dnd.dragging?.kind === item.kind && dnd.dragging.id === item.id

  return {
    dropZone,
    isDragging,
    /** The row's grip for dragging with a finger (touch screens only). */
    handle: dnd.enabled ? (
      <DragHandle
        label={`Drag ${dragText}`}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          dnd.touchStart(item, e, dragText)
        }}
      />
    ) : null,
    rowProps: {
      'data-dnd-key': key,
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
  dnd.register('root', target)
  return {
    visible: dnd.dragging !== null,
    active: dnd.over?.key === 'root',
    dropProps: {
      'data-dnd-key': 'root',
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

/** The grip a finger drags a row by: only on touch screens (coarse
 * pointers), where there's no native drag and drop. It takes the touch
 * itself (no scrolling, no app swipe, no long-press menu). */
function DragHandle({
  label,
  onPointerDown,
}: {
  label: string
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      data-no-swipe
      tabIndex={-1}
      className="hidden touch-none text-muted-foreground pointer-coarse:inline-flex"
      onPointerDown={onPointerDown}
      onTouchStart={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <GripVerticalIcon />
    </Button>
  )
}
