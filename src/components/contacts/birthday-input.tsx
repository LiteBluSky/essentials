import { useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MONTHS,
  formatBirthdayValue,
  parseBirthday,
} from '@/lib/contacts/birthday'

const DAYS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Day' },
  ...Array.from({ length: 31 }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
  })),
]

const MONTH_ITEMS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Month' },
  ...MONTHS.map((name, i) => ({ value: i + 1, label: name })),
]

/**
 * A birthday as day + month (+ an optional year). The value is `MM-DD` /
 * `YYYY-MM-DD`, '' when nothing is picked, or something the schema rejects
 * while it's only half filled in (so the form says so).
 */
export function BirthdayInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  invalid?: boolean
}) {
  const initial = parseBirthday(value)
  const [day, setDay] = useState<number | null>(initial?.day ?? null)
  const [month, setMonth] = useState<number | null>(initial?.month ?? null)
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '')

  const emit = (d: number | null, m: number | null, y: string) => {
    const typedYear = y.trim()
    if (d === null && m === null && !typedYear) return onChange('')
    if (d === null || m === null || (typedYear && !/^\d{4}$/.test(typedYear))) {
      return onChange('incomplete')
    }
    onChange(
      formatBirthdayValue({
        day: d,
        month: m,
        year: typedYear ? Number(typedYear) : null,
      }),
    )
  }

  return (
    <div className="grid grid-cols-[5rem_1fr_6rem] gap-2">
      <Select
        items={DAYS}
        value={day}
        onValueChange={(next) => {
          setDay(next)
          emit(next, month, year)
        }}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {DAYS.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        items={MONTH_ITEMS}
        value={month}
        onValueChange={(next) => {
          setMonth(next)
          emit(day, next, year)
        }}
      >
        <SelectTrigger
          className="w-full"
          aria-label="Month"
          aria-invalid={invalid}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {MONTH_ITEMS.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        aria-label="Year (optional)"
        placeholder="Year"
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        value={year}
        onBlur={onBlur}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '')
          setYear(next)
          emit(day, month, next)
        }}
        aria-invalid={invalid}
      />
    </div>
  )
}
