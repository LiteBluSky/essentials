import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Command,
  CommandEmpty,
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
import { Kbd } from '@/components/ui/kbd'
import type { CalendarEvent } from '@/db/schema'
import { colorClass } from '@/lib/calendar/colors'
import { isoDay } from '@/lib/calendar/layout'
import { cn } from '@/lib/utils'
import { rangeLabel } from './event-dialog'

/**
 * `i` in the Calendar: every strip in one list, earliest first (those
 * already over dimmed), opening on the first one not over yet. Vim keys
 * while the list has focus: j/k (↓/↑) move, gg/G first/last, Enter/o go to
 * it in the month, e edit, d delete, / filters by name (Esc back to the
 * list), Esc closes. A click goes to it too.
 */
export function StripsDialog({
  open,
  onOpenChange,
  events,
  onGo,
  onEdit,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  events: Array<CalendarEvent>
  // Each called once the dialog has closed (so focus goes where they put it).
  onGo: (event: CalendarEvent) => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
}) {
  const [query, setQuery] = useState('')
  const [value, setValue] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastG = useRef(0)
  // What to do once closed: go to / edit / delete a strip.
  const pending = useRef<(() => void) | null>(null)
  // Reset only when it opens again: Base UI may restore focus after
  // onOpenChangeComplete (as in the global search).
  const returnFocus = useRef(true)
  const today = isoDay(new Date())

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          a.startDay.localeCompare(b.startDay) ||
          a.endDay.localeCompare(b.endDay) ||
          a.id - b.id,
      ),
    [events],
  )
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return sorted
    return sorted.filter((e) => {
      const text =
        `${e.title} ${rangeLabel(e.startDay, e.endDay)}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
  }, [sorted, query])

  // Opening: keep the highlighted strip if it's still there (e.g. back from
  // editing it), else the first one not over yet.
  useEffect(() => {
    if (!open) return
    setValue((v) =>
      sorted.some((e) => String(e.id) === v)
        ? v
        : String(
            (sorted.find((e) => e.endDay >= today) ?? sorted.at(-1))?.id ?? '',
          ),
    )
    // Only when it opens.
  }, [open])

  const current = shown.find((e) => String(e.id) === value) ?? shown.at(0)

  useEffect(() => {
    if (!open || !current) return
    listRef.current
      ?.querySelector(`[data-strip-id="${current.id}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, current])

  const select = (event: CalendarEvent | undefined) => {
    if (event) setValue(String(event.id))
  }
  const move = (step: number) => {
    if (!shown.length) return
    const index = current ? shown.indexOf(current) : -1
    select(shown[Math.min(Math.max(index + step, 0), shown.length - 1)])
  }
  const after = (
    action: (event: CalendarEvent) => void,
    event: CalendarEvent | undefined,
  ) => {
    if (!event) return
    pending.current = () => action(event)
    returnFocus.current = false
    onOpenChange(false)
  }
  const go = (event: CalendarEvent | undefined) => after(onGo, event)

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const handled = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (e.target === inputRef.current) {
      // Esc in the filter: back to the list (the dialog stays open).
      if (e.key === 'Escape') {
        handled()
        listRef.current?.focus()
      } else if (e.key === 'Enter') {
        handled()
        go(current)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        handled()
        move(e.key === 'ArrowDown' ? 1 : -1)
      }
      return
    }
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        handled()
        move(1)
        break
      case 'k':
      case 'ArrowUp':
        handled()
        move(-1)
        break
      case 'g': {
        handled()
        const now = Date.now()
        if (now - lastG.current < 500) {
          lastG.current = 0
          select(shown.at(0))
        } else lastG.current = now
        break
      }
      case 'G':
        handled()
        select(shown.at(-1))
        break
      case 'Enter':
      case 'o':
        handled()
        go(current)
        break
      case 'e':
        handled()
        after(onEdit, current)
        break
      case 'd':
      case 'Delete':
        handled()
        after(onDelete, current)
        break
      case '/':
        handled()
        inputRef.current?.focus()
        break
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) {
          returnFocus.current = true
          return
        }
        const action = pending.current
        pending.current = null
        if (action) setTimeout(action)
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>All strips</DialogTitle>
        <DialogDescription>
          Every strip on the calendar: go to one, edit or delete it.
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-[15%] translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
        initialFocus={listRef}
        // A pick puts focus somewhere itself (its day, the form): don't
        // take it back.
        finalFocus={() => returnFocus.current}
      >
        <div onKeyDownCapture={onKeyDownCapture}>
          <Command shouldFilter={false} value={value} onValueChange={setValue}>
            <CommandInput
              ref={inputRef}
              placeholder="Filter strips… (/)"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList
              ref={listRef}
              tabIndex={-1}
              className="max-h-[60vh] outline-none"
            >
              <CommandEmpty>
                {events.length ? 'No strip matches.' : 'No strips yet.'}
              </CommandEmpty>
              {shown.map((event) => (
                <CommandItem
                  key={event.id}
                  value={String(event.id)}
                  data-strip-id={event.id}
                  onSelect={() => go(event)}
                  className={cn(event.endDay < today && 'opacity-60')}
                >
                  <span
                    className={cn(
                      'size-3 shrink-0 rounded-full',
                      colorClass(event.color),
                    )}
                  />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                    <span
                      className={cn(
                        'truncate',
                        !event.title && 'text-muted-foreground',
                      )}
                    >
                      {event.title || 'Untitled'}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {rangeLabel(event.startDay, event.endDay)}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          <p className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              <Kbd>j</Kbd> <Kbd>k</Kbd> move
            </span>
            <span>
              <Kbd>Enter</Kbd> go to it
            </span>
            <span>
              <Kbd>e</Kbd> edit
            </span>
            <span>
              <Kbd>d</Kbd> delete
            </span>
            <span>
              <Kbd>/</Kbd> filter
            </span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
