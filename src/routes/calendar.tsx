import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { addMonths, format, startOfMonth } from 'date-fns'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyboardIcon,
  SearchIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { AppNav } from '@/components/app-nav'
import { AssistantBox } from '@/components/assistant-box'
import { CalendarMenu } from '@/components/calendar/calendar-menu'
import {
  DeleteStripDialog,
  EventDialog,
} from '@/components/calendar/event-dialog'
import type { EventEditor } from '@/components/calendar/event-dialog'
import { DAY_KEY_ALIASES, sendDayKey } from '@/components/calendar/day-keys'
import { DayMenu } from '@/components/calendar/day-menu'
import type { DayMenuAt } from '@/components/calendar/day-menu'
import { MonthGrid } from '@/components/calendar/month-grid'
import { ShortcutsDialog } from '@/components/calendar/shortcuts-dialog'
import { StripMenu } from '@/components/calendar/strip-menu'
import { StripsDialog } from '@/components/calendar/strips-dialog'
import { CalendarTaskDialog } from '@/components/calendar/task-dialog'
import type { EditorState as TaskEditorState } from '@/components/tasks/editor'
import { GlobalSearch } from '@/components/global-search'
import { ProfileButton } from '@/components/profile-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { useStripEdit } from '@/hooks/calendar/use-strip-edit'
import { useHydrated } from '@/hooks/use-hydrated'
import { byStart, isoDay, orderedRange, parseDay } from '@/lib/calendar/layout'
import type { Strip } from '@/lib/calendar/layout'
import { APP_NAME } from '@/lib/config'
import type { CalendarEvent } from '@/db/schema'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import { calendarQueryOptions } from '@/server/calendar.functions'
import { tasksTreeQueryOptions } from '@/server/tasks.functions'
import { isShortcut, shortcutKey, useShortcutLabels } from '@/lib/shortcuts'
import { Hint } from '@/components/hint'

// The Calendar app: a month of coloured strips, each over a day or a range
// of days (no times, no reminders), plus the tasks with a due date on their
// day. Strips are made by picking days on the grid: drag over them (or
// click one) with a mouse; with a finger, tap the first day, then the last.
// A strip is dragged to move it, its ends (once selected) to resize it, and
// right click / a long hold opens its menu (use-strip-edit.ts). A task
// opens in Tasks. Fills the whole page.
export const Route = createFileRoute('/calendar')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(calendarQueryOptions),
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
    ]),
  head: () => ({ meta: [{ title: `Calendar · ${APP_NAME}` }] }),
  component: CalendarPage,
})

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** A range being picked: by dragging, with Enter then moving, or (touch)
 * its first day tapped, waiting for the last. */
type Selection = {
  anchor: string
  focus: string
  by: 'pointer' | 'key' | 'touch'
}

/** The day of the focused day button, if one has focus. */
function focusedDay() {
  const cell = document.activeElement?.closest('td[data-day]')
  return cell?.getAttribute('data-day') ?? null
}

function focusDayButton(day: string) {
  document
    .querySelector<HTMLButtonElement>(`td[data-day="${day}"] button`)
    ?.focus()
}

function CalendarPage() {
  const keyLabel = useShortcutLabels()
  const navigate = useNavigate()
  const { data } = useSuspenseQuery(calendarQueryOptions)
  // Days are the browser's (timezone), so the grid renders once hydrated.
  const hydrated = useHydrated()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  const [selection, setSelection] = useState<Selection | null>(null)
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const [editor, setEditor] = useState<EventEditor | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // `i`: every strip in a list. Editing / deleting from it comes back to it.
  const [listOpen, setListOpen] = useState(false)
  const backToList = useRef(false)
  const [toDelete, setToDelete] = useState<CalendarEvent | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // A task's strip: the task's own dialog, here.
  const queryClient = useQueryClient()
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  // A day's menu: new strip / new task / that day's tasks.
  const [dayMenu, setDayMenu] = useState<DayMenuAt | null>(null)
  const dialogOpen =
    dayMenu !== null ||
    editorOpen ||
    taskOpen ||
    helpOpen ||
    searchOpen ||
    settingsOpen ||
    listOpen ||
    deleteOpen

  const editEvent = (event: CalendarEvent) => {
    setEditor({ mode: 'edit', event })
    setEditorOpen(true)
  }
  // Moving / resizing / selecting strips, and their menu.
  const stripEdit = useStripEdit({ events: data.events, onEdit: editEvent })
  const eventsById = useMemo(
    () => new Map(data.events.map((e) => [e.id, e])),
    [data.events],
  )
  const selectedEvent =
    stripEdit.selectedId === null
      ? undefined
      : eventsById.get(stripEdit.selectedId)
  const { preview } = stripEdit

  const strips = useMemo<Array<Strip>>(() => {
    const events: Array<Strip> = data.events.map((event) => {
      // A strip being dragged is laid out where it would land.
      const moved = preview?.id === event.id ? preview : null
      return {
        key: `event-${event.id}`,
        kind: 'event',
        id: event.id,
        title: event.title,
        start: moved?.start ?? event.startDay,
        end: moved?.end ?? event.endDay,
        color: event.color,
      }
    })
    if (!hydrated) return events
    const tasks: Array<Strip> = data.tasks.map((task) => {
      const day = isoDay(task.dueAt)
      return {
        key: `task-${task.id}`,
        kind: 'task',
        id: task.id,
        title: task.title,
        start: day,
        end: day,
        done: task.completedAt !== null,
      }
    })
    return [...events, ...tasks]
  }, [data, hydrated, preview])

  const openNew = (from: string, to: string) => {
    setSelection(null)
    setEditor({ mode: 'new', ...orderedRange(from, to) })
    setEditorOpen(true)
  }

  /** One day picked (a click, the same day tapped twice, Enter twice):
   * its menu, to choose between a strip and a task. Several days are a
   * strip. `at`: where (the pointer), else under the day's number. */
  const pick = (from: string, to: string, at?: { x: number; y: number }) => {
    if (from !== to) {
      openNew(from, to)
      return
    }
    openDayMenu(from, at)
  }

  const openDayMenu = (day: string, at?: { x: number; y: number }) => {
    let point = at
    if (!point) {
      const rect = document
        .querySelector(`td[data-day="${day}"] [data-day-number]`)
        ?.getBoundingClientRect()
      point = rect ? { x: rect.left, y: rect.bottom } : { x: 0, y: 0 }
    }
    // The day stays highlighted while its menu is open.
    setSelection((s) => s ?? { anchor: day, focus: day, by: 'pointer' })
    setDayMenu({ day, ...point })
  }

  /** A new task due that day, in Tasks' own form, here. */
  const newTask = (day: string) => {
    setSelection(null)
    void queryClient.ensureQueryData(tasksTreeQueryOptions).then(() => {
      setTaskEditor({
        kind: 'task',
        mode: 'edit',
        folderId: null,
        date: parseDay(day),
      })
      setTaskOpen(true)
    })
  }

  /** A task's strip opens the task's details here (Tasks' dialog). */
  const openStrip = (strip: Strip) => {
    if (strip.kind !== 'task') return
    void queryClient.ensureQueryData(tasksTreeQueryOptions).then(() => {
      setTaskEditor({ kind: 'task', mode: 'view', taskId: strip.id })
      setTaskOpen(true)
    })
  }

  /** `n` / `N`: focus the next / previous strip or task, in date order
   * (from the focused one, else the focused day or today), wrapping and
   * flipping to its month. Enter then opens it (a task) or selects it. */
  const stepStrip = (step: 1 | -1) => {
    const ordered = [...strips].sort(byStart)
    if (!ordered.length) return
    const current = document.activeElement
      ?.closest<HTMLElement>('[data-strip-key]')
      ?.getAttribute('data-strip-key')
    let index = current ? ordered.findIndex((s) => s.key === current) : -1
    if (index !== -1) index += step
    else {
      const from = focusedDay() ?? isoDay(new Date())
      if (step === 1) index = ordered.findIndex((s) => s.start >= from)
      else {
        for (let i = ordered.length - 1; i >= 0; i--) {
          if (ordered[i].start < from) {
            index = i
            break
          }
        }
      }
      if (index === -1) index = step === 1 ? 0 : ordered.length - 1
    }
    const strip = ordered[(index + ordered.length) % ordered.length]
    stripEdit.select(null)
    setMonth(startOfMonth(parseDay(strip.start)))
    // After the month has rendered; its first piece (the week it starts).
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-strip-key="${strip.key}"]`)
        ?.focus(),
    )
  }
  const askDelete = (event: CalendarEvent) => {
    setToDelete(event)
    setDeleteOpen(true)
  }

  // The mouse wheel over the grid flips months: down = next, up =
  // previous. If the grid itself scrolls (a short window), it scrolls
  // first and flips once at its end. A trackpad sends a burst of small
  // deltas: they add up to one flip, then a short pause before the next.
  const gridRef = useRef<HTMLDivElement>(null)
  // The month inside the grid (what slides; see below).
  const slideRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    let total = 0
    let lastFlip = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // zoom
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const down = e.deltaY > 0
      // The month's own height: a slide's transform would add to the
      // grid's scrollHeight for a moment.
      const height = slideRef.current?.scrollHeight ?? grid.scrollHeight
      const canScroll = down
        ? grid.scrollTop + grid.clientHeight < height - 1
        : grid.scrollTop > 0
      if (canScroll) return
      e.preventDefault()
      const now = Date.now()
      if (now - lastFlip < WHEEL_PAUSE_MS) return
      // Lines / pages (Firefox) count as a full step.
      const delta =
        e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * WHEEL_STEP
      // A turn the other way starts over (no leftover from the last one).
      if (Math.sign(delta) !== Math.sign(total)) total = 0
      total += delta
      if (Math.abs(total) < WHEEL_STEP) return
      // Taken now: React may run the updater later, after `total` is reset.
      const step = total > 0 ? 1 : -1
      setMonth((m) => addMonths(m, step))
      total = 0
      lastFlip = now
    }
    grid.addEventListener('wheel', onWheel, { passive: false })
    return () => grid.removeEventListener('wheel', onWheel)
  }, [])

  // A finger does the same: swiping up = next month, down = previous
  // (once the grid, if it scrolls, is at that end when the swipe starts).
  // The month follows the finger a little, then slides on or springs back.
  // Sideways swipes are left to the app switcher (swipe-apps.tsx).
  // Animates the month; a grid that fits isn't let scroll meanwhile (the
  // moved month would flash a scrollbar).
  const slide = (frames: Array<Keyframe>, easing: string) => {
    const grid = gridRef.current
    const el = slideRef.current
    if (!grid || !el) return
    const fits = grid.scrollHeight <= grid.clientHeight
    if (fits) grid.style.overflow = 'hidden'
    const done = () => {
      if (fits) grid.style.overflow = ''
    }
    const animation = el.animate(frames, { duration: SLIDE_MS, easing })
    animation.onfinish = done
    animation.oncancel = done
  }
  const slideFn = useRef(slide)
  slideFn.current = slide
  const stripBusy = stripEdit.busy
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    let from: {
      x: number
      y: number
      atTop: boolean
      atBottom: boolean
      mode: 'flip' | 'none' | null
      dy: number
    } | null = null
    const setOffset = (dy: number) => {
      const el = slideRef.current
      if (el) el.style.transform = dy ? `translateY(${dy}px)` : ''
    }
    const springBack = (dy: number) => {
      setOffset(0)
      slideFn.current(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        'ease-out',
      )
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (from?.mode === 'flip') springBack(from.dy)
        from = null
        return
      }
      const touch = e.touches[0]
      from = {
        x: touch.clientX,
        y: touch.clientY,
        atTop: grid.scrollTop <= 0,
        atBottom: grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 1,
        mode: null,
        dy: 0,
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!from || from.mode === 'none') return
      // A strip (or its handle) is being dragged: not a month swipe.
      if (stripBusy.current) {
        if (from.mode === 'flip') springBack(from.dy)
        from = null
        return
      }
      const touch = e.touches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (from.mode === null) {
        if (Math.hypot(dx, dy) < 10) return
        const vertical = Math.abs(dy) > Math.abs(dx)
        const atEnd = dy < 0 ? from.atBottom : from.atTop
        from.mode = vertical && atEnd && e.cancelable ? 'flip' : 'none'
        if (from.mode === 'none') return
      }
      // Not a scroll (nor a pull-to-refresh): the month follows instead.
      e.preventDefault()
      from.dy = Math.max(-MAX_PULL, Math.min(MAX_PULL, dy * PULL))
      setOffset(from.dy)
    }
    const onEnd = () => {
      const swipe = from
      from = null
      if (swipe?.mode !== 'flip') return
      if (Math.abs(swipe.dy) >= FLIP_PULL) {
        // The month's own slide-in takes it from here.
        setOffset(0)
        setMonth((m) => addMonths(m, swipe.dy < 0 ? 1 : -1))
      } else {
        springBack(swipe.dy)
      }
    }
    const onCancel = () => {
      if (from?.mode === 'flip') springBack(from.dy)
      from = null
    }
    grid.addEventListener('touchstart', onStart, { passive: true })
    grid.addEventListener('touchmove', onMove, { passive: false })
    grid.addEventListener('touchend', onEnd)
    grid.addEventListener('touchcancel', onCancel)
    return () => {
      grid.removeEventListener('touchstart', onStart)
      grid.removeEventListener('touchmove', onMove)
      grid.removeEventListener('touchend', onEnd)
      grid.removeEventListener('touchcancel', onCancel)
    }
  }, [])

  // Every month change (buttons, keys, wheel, swipe) slides the new month
  // in from the side it came from: a later month from below, an earlier
  // one from above. Not with reduced motion.
  const shownMonth = useRef(month)
  useLayoutEffect(() => {
    const before = shownMonth.current
    shownMonth.current = month
    if (before.getTime() === month.getTime()) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const sign = month > before ? 1 : -1
    slide(
      [
        { transform: `translateY(${sign * SLIDE_FROM}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      'cubic-bezier(0.2, 0.8, 0.2, 1)',
    )
  }, [month])

  const goToDay = (day: string) => {
    setMonth(startOfMonth(parseDay(day)))
    // After the month has rendered.
    requestAnimationFrame(() => focusDayButton(day))
  }

  // Dragging over days: the pointer is followed over the grid, and letting
  // go adds a strip over the days covered (a click = one day). A finger
  // taps the first day, then the last (the same one again for one day): a
  // swipe switches app / month instead.
  const dragging = useRef(false)
  const tapped = useRef<{ day: string; x: number; y: number } | null>(null)
  // A finger held on a day (DAY_HOLD_MS, without moving) opens its menu.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointer = useRef('')
  const stopHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => stopHold, [])
  useEffect(() => {
    const dayAt = (e: PointerEvent) =>
      document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('td[data-day]')
        ?.getAttribute('data-day') ?? null
    const onMove = (e: PointerEvent) => {
      const tap = tapped.current
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= 10) {
        stopHold() // A swipe, not a hold.
      }
      if (!dragging.current) return
      const day = dayAt(e)
      if (day) setSelection((s) => (s ? { ...s, focus: day } : s))
    }
    const onUp = (e: PointerEvent) => {
      stopHold()
      const tap = tapped.current
      tapped.current = null
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) {
        const s = selectionRef.current
        if (s?.by === 'touch') {
          pick(s.anchor, tap.day, { x: e.clientX, y: e.clientY })
        } else setSelection({ anchor: tap.day, focus: tap.day, by: 'touch' })
        return
      }
      if (!dragging.current) return
      dragging.current = false
      const s = selectionRef.current
      if (s) pick(s.anchor, s.focus, { x: e.clientX, y: e.clientY })
    }
    const onCancel = () => {
      stopHold()
      tapped.current = null
      if (!dragging.current) return
      dragging.current = false
      setSelection(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  })

  const onDayPointerDown = (day: string, e: React.PointerEvent) => {
    lastPointer.current = e.pointerType
    if (e.button !== 0) return
    // With a strip selected, a press elsewhere only lets go of it.
    if (stripEdit.selectedId !== null) {
      stripEdit.select(null)
      return
    }
    if (e.pointerType === 'touch') {
      tapped.current = { day, x: e.clientX, y: e.clientY }
      const { clientX: x, clientY: y } = e
      stopHold()
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null
        if (tapped.current?.day !== day) return
        // A hold, not a tap: the coming pointerup does nothing.
        tapped.current = null
        setSelection(null)
        if ('vibrate' in navigator) navigator.vibrate(15) // Not on iOS.
        openDayMenu(day, { x, y })
      }, DAY_HOLD_MS)
      return
    }
    dragging.current = true
    setSelection({ anchor: day, focus: day, by: 'pointer' })
  }

  /** Right click on a day. A finger's long press is timed above (and the
   * browser's own menu for it kept from opening); the keyboard's menu key
   * opens it under the day's number. */
  const onDayContextMenu = (day: string, e: React.MouseEvent) => {
    if (e.defaultPrevented) return // A strip's own menu took it.
    e.preventDefault()
    if (lastPointer.current === 'touch') return // Timed above.
    if (dragging.current) {
      dragging.current = false
      setSelection(null)
    }
    stripEdit.select(null)
    const fromKeyboard = e.clientX === 0 && e.clientY === 0
    openDayMenu(day, fromKeyboard ? undefined : { x: e.clientX, y: e.clientY })
  }

  // Keys (not while typing or with a dialog open; listed in
  // calendar/shortcuts-dialog.tsx). DayPicker moves between days with the
  // arrows / PageUp / PageDown / Home / End; h/j/k/l, m/M and b/e are
  // sent as those.
  useEffect(() => {
    if (dialogOpen) return
    const onFocusIn = () => {
      const day = focusedDay()
      if (day) {
        setSelection((s) => (s?.by === 'key' ? { ...s, focus: day } : s))
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return
      if (isShortcut(e, 'global.globalSearch')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (isShortcut(e, 'global.help')) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      // The keys can be changed: `key` is the shortcut's default key.
      const key = shortcutKey(e, ['calendar'])
      if (key === null) return
      // The selected strip: Enter edits it, d / Delete deletes it, Esc lets
      // go of it.
      if (selectedEvent) {
        if (key === 'Escape') {
          e.preventDefault()
          stripEdit.select(null)
          return
        }
        if (key === 'Enter') {
          e.preventDefault()
          editEvent(selectedEvent)
          return
        }
        if (key === 'd' || key === 'Delete') {
          e.preventDefault()
          askDelete(selectedEvent)
          return
        }
      }
      // A focused strip takes Enter / Space itself (it gets selected).
      const onStrip = !!document.activeElement?.closest('[data-strip]')
      const day = onStrip ? null : focusedDay()
      const today = isoDay(new Date())
      if (key in DAY_KEY_ALIASES) {
        e.preventDefault()
        if (day) {
          sendDayKey(document.activeElement, key)
        } else if (key === 'm' || key === 'M') {
          setMonth((m) => addMonths(m, key === 'm' ? 1 : -1))
        } else {
          goToDay(today)
        }
        return
      }
      switch (key) {
        case 'Enter':
        case ' ': {
          if (!day) return
          e.preventDefault()
          const s = selectionRef.current
          if (s?.by === 'key') pick(s.anchor, day)
          else setSelection({ anchor: day, focus: day, by: 'key' })
          break
        }
        case 'Escape':
          if (selectionRef.current) {
            e.preventDefault()
            setSelection(null)
          }
          break
        case 'a': {
          e.preventDefault()
          const s = selectionRef.current
          if (s) openNew(s.anchor, s.focus)
          else openNew(day ?? today, day ?? today)
          break
        }
        case 't':
          e.preventDefault()
          goToDay(today)
          break
        case 'o':
          // That day's tasks, in Tasks.
          e.preventDefault()
          void navigate({ to: '/tasks', search: { day: day ?? today } })
          break
        case 'i':
          e.preventDefault()
          setListOpen(true)
          break
        case 'n':
        case 'N':
          e.preventDefault()
          stepStrip(key === 'n' ? 1 : -1)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('focusin', onFocusIn)
    }
  })

  const shown = selection
    ? orderedRange(selection.anchor, selection.focus)
    : null

  return (
    <main className="flex h-dvh w-full flex-col gap-3 px-4 pt-8 pb-3 sm:pb-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-lg:flex-col max-lg:items-stretch">
        <AppNav />
        <div className="flex items-center gap-3 max-lg:order-last max-lg:justify-between">
          <ButtonGroup aria-label="Month">
            <Hint label={`Previous month (${keyLabel('calendar.prevMonth')})`}>
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous month"
                onClick={() => setMonth((m) => addMonths(m, -1))}
              >
                <ChevronLeftIcon />
              </Button>
            </Hint>
            <Button
              variant="outline"
              onClick={() => goToDay(isoDay(new Date()))}
            >
              Today
            </Button>
            <Hint label={`Next month (${keyLabel('calendar.nextMonth')})`}>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next month"
                onClick={() => setMonth((m) => addMonths(m, 1))}
              >
                <ChevronRightIcon />
              </Button>
            </Hint>
          </ButtonGroup>
          <h1 className="text-lg font-medium">
            {hydrated ? format(month, 'MMMM yyyy') : ''}
          </h1>
        </div>
        <div className="flex justify-end gap-2">
          <ButtonGroup aria-label="Settings">
            <Hint
              label={`Search everything (${keyLabel('global.globalSearch')})`}
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Search everything"
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon />
              </Button>
            </Hint>
            <CalendarMenu
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
            />
            <Hint label={`Keyboard shortcuts (${keyLabel('global.help')})`}>
              <Button
                variant="outline"
                size="icon"
                aria-label="Keyboard shortcuts"
                onClick={() => setHelpOpen(true)}
              >
                <KeyboardIcon />
              </Button>
            </Hint>
            <ThemeToggle />
            <ProfileButton />
          </ButtonGroup>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Touch: the first day is tapped; the next tap makes the strip. */}
        {selection?.by === 'touch' && (
          <div className="pointer-events-none absolute inset-x-0 top-8 z-20 flex justify-center">
            <Badge
              variant="secondary"
              className="pointer-events-auto h-auto gap-2 py-1 pr-1 pl-3 shadow-md"
            >
              From {format(parseDay(selection.anchor), 'EEE d MMM')}: tap the
              last day
              <Button
                size="xs"
                variant="outline"
                onClick={() => setSelection(null)}
              >
                Cancel
              </Button>
            </Badge>
          </div>
        )}
        <div ref={gridRef} className="min-h-0 flex-1 overflow-auto">
          <div ref={slideRef} className="size-full">
            {hydrated && (
              <MonthGrid
                month={month}
                onMonthChange={setMonth}
                strips={strips}
                selection={shown}
                onDayPointerDown={onDayPointerDown}
                onDayContextMenu={onDayContextMenu}
                onOpenStrip={openStrip}
                events={eventsById}
                edit={stripEdit}
              />
            )}
          </div>
        </div>
      </div>
      <DayMenu
        at={dayMenu}
        onClose={() => {
          setDayMenu(null)
          setSelection(null)
        }}
        onNewStrip={(day) => openNew(day, day)}
        onNewTask={newTask}
        onShowTasks={(day) => void navigate({ to: '/tasks', search: { day } })}
      />
      <StripMenu
        at={stripEdit.menu}
        event={
          stripEdit.menu ? (eventsById.get(stripEdit.menu.id) ?? null) : null
        }
        onClose={stripEdit.closeMenu}
        onEdit={editEvent}
        onColor={stripEdit.setColor}
        onDelete={askDelete}
      />

      <EventDialog
        editor={editor}
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (open) return
          setSelection(null)
          if (backToList.current) {
            backToList.current = false
            setListOpen(true)
          }
        }}
      />
      <StripsDialog
        open={listOpen}
        onOpenChange={setListOpen}
        events={data.events}
        onGo={(event) => goToDay(event.startDay)}
        onEdit={(event) => {
          backToList.current = true
          editEvent(event)
        }}
        onDelete={(event) => {
          backToList.current = true
          askDelete(event)
        }}
      />
      <DeleteStripDialog
        event={toDelete}
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (open) return
          if (backToList.current) {
            backToList.current = false
            setListOpen(true)
          }
        }}
      />
      <CalendarTaskDialog
        state={taskEditor}
        open={taskOpen}
        onOpenChange={setTaskOpen}
        onChange={(state) => {
          setTaskEditor(state)
          setTaskOpen(true)
        }}
      />
      <AssistantBox enabled={!dialogOpen} phonesOnly />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  )
}

/** How long a finger is held on a day to open its menu (ms). */
const DAY_HOLD_MS = 500

// Wheel → month: how much scrolling makes one flip (px), and the pause
// after one before the next.
const WHEEL_STEP = 40
const WHEEL_PAUSE_MS = 400

// Swipe → month: the month follows the finger at PULL × its distance, at
// most MAX_PULL px, and flips once pulled FLIP_PULL px. A new month slides
// in from SLIDE_FROM px away over SLIDE_MS.
const PULL = 0.4
const MAX_PULL = 120
const FLIP_PULL = 40
const SLIDE_FROM = 48
const SLIDE_MS = 220
