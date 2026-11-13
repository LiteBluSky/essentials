import { format, isToday } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { categoriesFor } from '@/lib/finances/categories'
import type { CategoryKey, EntryKind } from '@/lib/finances/categories'
import { CURRENCIES } from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'

// Small pickers shared by the quick entry and the Finances forms.

/** `YYYY-MM-DD` ⇄ a local Date. */
export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function isoDay(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

/** A day in a popover calendar; `compact` shows "Today" / "12 Nov". */
export function DayPicker({
  id,
  value,
  onChange,
  compact = false,
}: {
  id?: string
  value: string
  onChange: (day: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const date = parseDay(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        render={
          <Button
            variant="outline"
            className={cn(!compact && 'w-full justify-start font-normal')}
            aria-label="Day"
            title="Day"
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {compact
          ? isToday(date)
            ? 'Today'
            : format(date, 'd MMM')
          : format(date, 'EEE d MMM yyyy')}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          required
          autoFocus
          weekStartsOn={1}
          selected={date}
          defaultMonth={date}
          onSelect={(picked) => {
            onChange(isoDay(picked))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function CategorySelect({
  id,
  kind,
  value,
  onChange,
  className,
}: {
  id?: string
  kind: EntryKind
  value: CategoryKey
  onChange: (key: CategoryKey) => void
  className?: string
}) {
  const items = categoriesFor(kind).map((c) => ({
    value: c.key,
    label: c.label,
  }))
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger id={id} className={className} aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {categoriesFor(kind).map((c) => (
            <SelectItem key={c.key} value={c.key}>
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: c.color }}
              />
              {c.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function CurrencySelect({
  id,
  value,
  onChange,
  className,
}: {
  id?: string
  value: Currency
  onChange: (currency: Currency) => void
  className?: string
}) {
  const items = CURRENCIES.map((c) => ({ value: c, label: c }))
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger id={id} className={className} aria-label="Currency">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
