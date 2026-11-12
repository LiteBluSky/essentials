import { CircleCheckIcon, CircleIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { DayButtonProps, DayProps } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { colorClass } from '@/lib/calendar/colors'
import { WEEK_STARTS_ON, layoutWeeks, monthWeeks } from '@/lib/calendar/layout'
import type { Slot, Strip } from '@/lib/calendar/layout'

// The Calendar app's month: shadcn's Calendar (react-day-picker) stretched
// over the page, each day cell holding its lanes of strips. A strip is drawn
// once per week, in its first day there, as wide as the days it covers;
// the days it passes over keep an empty lane so everything lines up.

type GridContextValue = {
  slots: Map<string, Array<Slot>>
  selection: { from: string; to: string } | null
  onDayPointerDown: (day: string, e: React.PointerEvent) => void
  onOpenStrip: (strip: Strip) => void
}

const GridContext = createContext<GridContextValue | null>(null)

function useGrid() {
  const value = useContext(GridContext)
  if (!value) throw new Error('Outside MonthGrid')
  return value
}

export function MonthGrid({
  month,
  onMonthChange,
  strips,
  selection,
  onDayPointerDown,
  onOpenStrip,
}: {
  month: Date
  onMonthChange: (month: Date) => void
  strips: Array<Strip>
} & Omit<GridContextValue, 'slots'>) {
  const slots = useMemo(
    () => layoutWeeks(monthWeeks(month), strips),
    [month, strips],
  )
  return (
    <GridContext.Provider
      value={{ slots, selection, onDayPointerDown, onOpenStrip }}
    >
      <Calendar
        month={month}
        onMonthChange={onMonthChange}
        weekStartsOn={WEEK_STARTS_ON}
        fixedWeeks
        showOutsideDays
        hideNavigation
        // Makes the days focusable buttons (the arrows move between them);
        // what a click does is handled on the cell (pointer events).
        onDayClick={() => {}}
        className="size-full p-0"
        classNames={{
          root: 'size-full',
          months: 'size-full',
          month: 'flex size-full flex-col',
          month_caption: 'sr-only',
          month_grid: 'h-full w-full table-fixed border-collapse',
          weekdays: '',
          weekday: 'pb-1 text-xs font-normal text-muted-foreground select-none',
          week: '',
          day: '',
        }}
        components={{ Day: DayCell, DayButton: DayNumber }}
      />
    </GridContext.Provider>
  )
}

function DayCell({ day, modifiers, className, children, ...props }: DayProps) {
  const { slots, selection, onDayPointerDown } = useGrid()
  const iso = day.isoDate
  const lanes = slots.get(iso) ?? []
  const selected =
    selection !== null && iso >= selection.from && iso <= selection.to
  const weekend = day.date.getDay() === 0 || day.date.getDay() === 6
  return (
    <td
      {...props}
      className={cn(
        className,
        // Grid lines as inset shadows, so cells stay exactly equal widths
        // and a strip spanning n days is n × 100% wide.
        'h-px p-0 align-top shadow-[inset_-1px_-1px_0_var(--color-border)] select-none first:shadow-[inset_1px_0_0_var(--color-border),inset_-1px_-1px_0_var(--color-border)]',
        // Weekends a touch greyer (muted is darker than the page in light
        // mode, lighter in dark); the other months' days greyer still.
        weekend && (modifiers.outside ? 'bg-muted/80' : 'bg-muted/50'),
        !weekend && modifiers.outside && 'bg-muted/30',
        selected && 'bg-primary/15',
      )}
      onPointerDown={(e) => onDayPointerDown(iso, e)}
    >
      <div className="flex h-full min-h-20 flex-col gap-0.5 pb-1">
        <div className="flex px-1 pt-1">{children}</div>
        {lanes.map((slot, lane) =>
          slot && slot !== 'covered' ? (
            <StripBar key={slot.strip.key} slot={slot} />
          ) : (
            <div key={lane} aria-hidden className="h-5 shrink-0" />
          ),
        )}
      </div>
    </td>
  )
}

function DayNumber({ day, modifiers, className, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  // As shadcn's day button: follow DayPicker's keyboard focus.
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])
  return (
    <Button
      ref={ref}
      variant={modifiers.today ? 'default' : 'ghost'}
      size="icon-xs"
      className={cn(
        className,
        'rounded-full font-normal tabular-nums',
        modifiers.outside && !modifiers.today && 'text-muted-foreground',
      )}
      {...props}
    />
  )
}

function StripBar({ slot }: { slot: Exclude<Slot, null | 'covered'> }) {
  const { onOpenStrip } = useGrid()
  const { strip, span, continued, continues } = slot
  const left = continued ? 0 : 3
  const right = continues ? 0 : 3
  const Icon = strip.done ? CircleCheckIcon : CircleIcon
  return (
    <button
      type="button"
      title={strip.title || undefined}
      // Drawn over the next days of the week (they keep an empty lane).
      style={{
        width: `calc(${span * 100}% - ${left + right}px)`,
        marginLeft: left,
      }}
      className={cn(
        'relative z-10 flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-left text-xs leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring',
        continued && 'rounded-l-none',
        continues && 'rounded-r-none',
        strip.kind === 'event'
          ? colorClass(strip.color ?? '')
          : 'bg-muted text-foreground ring-1 ring-border ring-inset',
        strip.done && 'text-muted-foreground line-through',
      )}
      // A strip is opened, not the start of a new range.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onOpenStrip(strip)}
    >
      {strip.kind === 'task' && <Icon className="size-3 shrink-0" />}
      <span className="truncate">{strip.title}</span>
    </button>
  )
}
