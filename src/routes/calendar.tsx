import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { addMonths, format, startOfMonth } from 'date-fns'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyboardIcon,
  PlusIcon,
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
import { MonthGrid } from '@/components/calendar/month-grid'
import { ShortcutsDialog } from '@/components/calendar/shortcuts-dialog'
import { StripsDialog } from '@/components/calendar/strips-dialog'
import { GlobalSearch } from '@/components/global-search'
import { ProfileButton } from '@/components/profile-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Kbd } from '@/components/ui/kbd'
import { useHydrated } from '@/hooks/use-hydrated'
import { isoDay, orderedRange, parseDay } from '@/lib/calendar/layout'
import type { Strip } from '@/lib/calendar/layout'
import { APP_NAME } from '@/lib/config'
import { requestOpen } from '@/lib/global-search'
import type { CalendarEvent } from '@/db/schema'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import { calendarQueryOptions } from '@/server/calendar.functions'

// The Calendar app: a month of coloured strips, each over a day or a range
// of days (no times, no reminders), plus the tasks with a due date on their
// day. Drag over days (or click one) to add a strip; click a strip to edit
// it (a task opens in Tasks). Fills the whole page.
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

/** A range being picked: by dragging, or with Enter then moving. */
type Selection = { anchor: string; focus: string; by: 'pointer' | 'key' }

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
  const dialogOpen =
    editorOpen ||
    helpOpen ||
    searchOpen ||
    settingsOpen ||
    listOpen ||
    deleteOpen

  const strips = useMemo<Array<Strip>>(() => {
    const events: Array<Strip> = data.events.map((event) => ({
      key: `event-${event.id}`,
      kind: 'event',
      id: event.id,
      title: event.title,
      start: event.startDay,
      end: event.endDay,
      color: event.color,
    }))
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
  }, [data, hydrated])

  const openNew = (from: string, to: string) => {
    setSelection(null)
    setEditor({ mode: 'new', ...orderedRange(from, to) })
    setEditorOpen(true)
  }

  const openStrip = (strip: Strip) => {
    if (strip.kind === 'task') {
      requestOpen({ app: 'tasks', kind: 'item', id: strip.id })
      void navigate({ to: '/tasks' })
      return
    }
    const event = data.events.find((e) => e.id === strip.id)
    if (!event) return
    setEditor({ mode: 'edit', event })
    setEditorOpen(true)
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
  // only taps a day (a swipe switches app instead; the dialog sets the
  // range).
  const dragging = useRef(false)
  const tapped = useRef<{ day: string; x: number; y: number } | null>(null)
  useEffect(() => {
    const dayAt = (e: PointerEvent) =>
      document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('td[data-day]')
        ?.getAttribute('data-day') ?? null
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const day = dayAt(e)
      if (day) setSelection((s) => (s ? { ...s, focus: day } : s))
    }
    const onUp = (e: PointerEvent) => {
      const tap = tapped.current
      tapped.current = null
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) {
        openNew(tap.day, tap.day)
        return
      }
      if (!dragging.current) return
      dragging.current = false
      const s = selectionRef.current
      if (s) openNew(s.anchor, s.focus)
    }
    const onCancel = () => {
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
    if (e.button !== 0) return
    if (e.pointerType === 'touch') {
      tapped.current = { day, x: e.clientX, y: e.clientY }
      return
    }
    dragging.current = true
    setSelection({ anchor: day, focus: day, by: 'pointer' })
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
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      const day = focusedDay()
      const today = isoDay(new Date())
      if (e.key in DAY_KEY_ALIASES) {
        e.preventDefault()
        if (day) {
          sendDayKey(document.activeElement, e.key)
        } else if (e.key === 'm' || e.key === 'M') {
          setMonth((m) => addMonths(m, e.key === 'm' ? 1 : -1))
        } else {
          goToDay(today)
        }
        return
      }
      switch (e.key) {
        case 'Enter':
        case ' ': {
          if (!day) return
          e.preventDefault()
          const s = selectionRef.current
          if (s?.by === 'key') openNew(s.anchor, day)
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
        case 'z':
          e.preventDefault()
          setSearchOpen(true)
          break
        case '?':
          e.preventDefault()
          setHelpOpen(true)
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
    <main className="flex h-dvh w-full flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-lg:flex-col max-lg:items-stretch">
        <AppNav />
        <div className="flex items-center gap-3 max-lg:order-last max-lg:justify-between">
          <ButtonGroup aria-label="Month">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              title="Previous month (M)"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              onClick={() => goToDay(isoDay(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              title="Next month (m)"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRightIcon />
            </Button>
          </ButtonGroup>
          <h1 className="text-lg font-medium">
            {hydrated ? format(month, 'MMMM yyyy') : ''}
          </h1>
        </div>
        <div className="flex justify-between gap-2">
          <Button
            onClick={() => {
              const today = isoDay(new Date())
              openNew(today, today)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            New
            <Kbd className="max-lg:hidden">a</Kbd>
          </Button>
          <ButtonGroup aria-label="Settings">
            <Button
              variant="outline"
              size="icon"
              aria-label="Search everything"
              title="Search everything (z)"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </Button>
            <CalendarMenu
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              onClick={() => setHelpOpen(true)}
            >
              <KeyboardIcon />
            </Button>
            <ThemeToggle />
            <ProfileButton />
          </ButtonGroup>
        </div>
      </header>

      <div ref={gridRef} className="min-h-0 flex-1 overflow-auto">
        <div ref={slideRef} className="size-full">
          {hydrated && (
            <MonthGrid
              month={month}
              onMonthChange={setMonth}
              strips={strips}
              selection={shown}
              onDayPointerDown={onDayPointerDown}
              onOpenStrip={openStrip}
            />
          )}
        </div>
      </div>

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
          setEditor({ mode: 'edit', event })
          setEditorOpen(true)
        }}
        onDelete={(event) => {
          backToList.current = true
          setToDelete(event)
          setDeleteOpen(true)
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
      <AssistantBox enabled={!dialogOpen} phonesOnly />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  )
}

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
