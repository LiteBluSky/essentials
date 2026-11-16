import { useQueryClient } from '@tanstack/react-query'
import { addDays, differenceInCalendarDays } from 'date-fns'
import { useEffect, useRef, useState } from 'react'

import type { StripMenuAt } from '@/components/calendar/strip-menu'
import { toast } from '@/components/ui/toast'
import type { CalendarEvent } from '@/db/schema'
import type { CalendarColor } from '@/lib/calendar/colors'
import { isoDay, parseDay } from '@/lib/calendar/layout'
import { calendarQueryOptions, updateEvent } from '@/server/calendar.functions'

// Moving and resizing the Calendar's strips with the pointer.
//
// Mouse / pen: press a strip and drag to move it; a click selects it (its
// ends then show handles: drag one to make it longer or shorter; a click on
// the selected strip edits it); right click opens its menu.
// Touch: hold a strip (HOLD_MS) to grab it, then drag to move it; let go
// without dragging and it's selected (handles, as above); keep holding
// (MENU_MS) and its menu opens instead. A finger that moves before the hold
// is a scroll / swipe, as ever.

/** Touch: holding this long grabs the strip. */
const HOLD_MS = 300
/** Touch: holding this long, without dragging, opens the menu. */
const MENU_MS = 900
/** How far (px) the pointer goes before it's a drag (or, before the hold on
 * touch, a scroll). */
const SLOP = 8

export type StripEdge = 'start' | 'end'

type Press = {
  id: number
  mode: 'move' | StripEdge
  touch: boolean
  /** Touch: held long enough to be grabbed. Mouse: at once. */
  active: boolean
  moved: boolean
  wasSelected: boolean
  x: number
  y: number
  /** The day pressed, and the strip's days then. */
  grabDay: string
  start: string
  end: string
}

/** The day cell at a point, even under a strip drawn over it. */
function dayAtPoint(x: number, y: number) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLElement && el.matches('td[data-day]')) {
      return el.dataset.day ?? null
    }
  }
  return null
}

/** A short buzz where the device can (not iOS). */
function buzz(ms: number) {
  if ('vibrate' in navigator) navigator.vibrate(ms)
}

export function useStripEdit({
  events,
  onEdit,
}: {
  events: Array<CalendarEvent>
  onEdit: (event: CalendarEvent) => void
}) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  /** Touch: the strip held long enough to be grabbed (drawn lifted). */
  const [grabbedId, setGrabbedId] = useState<number | null>(null)
  /** The days a strip being dragged would get. */
  const [preview, setPreview] = useState<{
    id: number
    start: string
    end: string
  } | null>(null)
  const [menu, setMenu] = useState<StripMenuAt | null>(null)

  const press = useRef<Press | null>(null)
  const previewRef = useRef(preview)
  previewRef.current = preview
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  /** True while a finger holds a strip or a handle: the page mustn't scroll
   * or flip months under it (read by the grid's swipe handler). */
  const busy = useRef(false)
  const lastPointer = useRef('mouse')

  const latest = { events, onEdit }
  const latestRef = useRef(latest)
  latestRef.current = latest

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const end = () => {
    clearTimers()
    press.current = null
    busy.current = false
    setGrabbedId(null)
    setPreview(null)
  }

  /** Saves a strip's new days / colour: shown at once, put back on failure. */
  const save = (
    event: CalendarEvent,
    change: Partial<Pick<CalendarEvent, 'startDay' | 'endDay' | 'color'>>,
  ) => {
    const next = { ...event, ...change }
    queryClient.setQueryData(calendarQueryOptions.queryKey, (data) =>
      data
        ? {
            ...data,
            events: data.events.map((e) => (e.id === event.id ? next : e)),
          }
        : data,
    )
    updateEvent({
      data: {
        id: next.id,
        title: next.title,
        color: next.color as CalendarColor,
        startDay: next.startDay,
        endDay: next.endDay,
      },
    })
      .catch((error: unknown) =>
        toast.add({
          title: "Couldn't save",
          description: error instanceof Error ? error.message : String(error),
          type: 'error',
        }),
      )
      .finally(() => queryClient.invalidateQueries(calendarQueryOptions))
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP
      if (!p.active) {
        // A finger that moves before the hold: a scroll or a swipe.
        if (far) end()
        return
      }
      if (!p.moved) {
        if (!far) return
        p.moved = true
        clearTimers() // Dragging: no menu.
      }
      const day = dayAtPoint(e.clientX, e.clientY)
      if (!day) return
      let start = p.start
      let finish = p.end
      if (p.mode === 'move') {
        const by = differenceInCalendarDays(parseDay(day), parseDay(p.grabDay))
        start = isoDay(addDays(parseDay(p.start), by))
        finish = isoDay(addDays(parseDay(p.end), by))
      } else if (p.mode === 'start') {
        start = day < p.end ? day : p.end
      } else {
        finish = day > p.start ? day : p.start
      }
      const now = previewRef.current
      if (now?.start !== start || now.end !== finish) {
        setPreview({ id: p.id, start, end: finish })
      }
    }
    const onUp = () => {
      const p = press.current
      if (!p) return
      const to = previewRef.current
      const event = latestRef.current.events.find((e) => e.id === p.id)
      end()
      if (!event) return
      if (p.moved) {
        if (to && (to.start !== event.startDay || to.end !== event.endDay)) {
          save(event, { startDay: to.start, endDay: to.end })
        }
        setSelectedId(p.id)
        return
      }
      if (p.mode !== 'move') return
      // A click / tap (or a hold let go): select it; on the selected one, edit.
      if (p.wasSelected && !p.touch) latestRef.current.onEdit(event)
      else setSelectedId(p.id)
    }
    // A grabbed strip (or a handle) follows the finger: no scrolling.
    const onTouchMove = (e: TouchEvent) => {
      if (busy.current && e.cancelable) e.preventDefault()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', end)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('touchmove', onTouchMove)
      clearTimers()
    }
  }, [])

  const begin = (
    event: CalendarEvent,
    mode: Press['mode'],
    e: React.PointerEvent,
  ) => {
    clearTimers()
    const touch = e.pointerType === 'touch'
    press.current = {
      id: event.id,
      mode,
      touch,
      // A handle drags at once (it's `touch-none`); a strip under a finger
      // only once held.
      active: !touch || mode !== 'move',
      moved: false,
      wasSelected: selectedId === event.id,
      x: e.clientX,
      y: e.clientY,
      grabDay: dayAtPoint(e.clientX, e.clientY) ?? event.startDay,
      start: event.startDay,
      end: event.endDay,
    }
    busy.current = press.current.active && touch
  }

  return {
    selectedId,
    grabbedId,
    preview,
    menu,
    busy,
    select: setSelectedId,
    closeMenu: () => setMenu(null),
    setColor: (event: CalendarEvent, color: CalendarColor) =>
      save(event, { color }),

    onStripPointerDown(event: CalendarEvent, e: React.PointerEvent) {
      lastPointer.current = e.pointerType
      // A strip is grabbed, not the start of a new range on its day.
      e.stopPropagation()
      if (e.button !== 0) return
      begin(event, 'move', e)
      if (e.pointerType !== 'touch') return
      const { clientX: x, clientY: y } = e
      timers.current = [
        setTimeout(() => {
          const p = press.current
          if (!p) return
          p.active = true
          busy.current = true
          setGrabbedId(p.id)
          buzz(10)
        }, HOLD_MS),
        setTimeout(() => {
          const p = press.current
          if (!p || p.moved) return
          end()
          setSelectedId(event.id)
          setMenu({ id: event.id, x, y })
          buzz(15)
        }, MENU_MS),
      ]
    },

    onHandlePointerDown(
      event: CalendarEvent,
      edge: StripEdge,
      e: React.PointerEvent,
    ) {
      lastPointer.current = e.pointerType
      e.stopPropagation()
      if (e.button !== 0) return
      e.preventDefault()
      begin(event, edge, e)
    },

    /** Right click. (A finger's long press is timed above; the browser's
     * own menu for it is only kept from opening.) */
    onStripContextMenu(event: CalendarEvent, e: React.MouseEvent) {
      e.preventDefault()
      if (lastPointer.current === 'touch') return
      end()
      setSelectedId(event.id)
      setMenu({ id: event.id, x: e.clientX, y: e.clientY })
    },
  }
}

export type StripEdit = ReturnType<typeof useStripEdit>
