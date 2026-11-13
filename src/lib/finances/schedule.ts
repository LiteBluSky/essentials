import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  getDaysInMonth,
  lastDayOfMonth,
  parseISO,
  startOfMonth,
} from 'date-fns'

// Recurring money (pure): when a recurring expense or income falls, in the
// spirit of Actual Budget's schedules. Every N days / weeks / months /
// years from the start day; a monthly one can instead fall on chosen days
// ("the 1st and 15th", "the last day", "the 2nd Friday", "the last working
// day"); a day on a weekend can move to the Friday before or the Monday
// after; it can end on a day or after a number of times.

export const EVERY = ['day', 'week', 'month', 'year'] as const
export type Every = (typeof EVERY)[number]

export type Pattern =
  /** A day of the month, 1–31 (the month's last day when shorter); -1 = the last day. */
  | { type: 'day'; day: number }
  /** The nth (1–5, -1 = last) Sunday (0) … Saturday (6) of the month. */
  | { type: 'weekday'; weekday: number; nth: number }
  /** The nth (1–23, -1 = last) working day (Mon–Fri) of the month. */
  | { type: 'workday'; nth: number }

export type Weekend = 'before' | 'after'

export type Schedule = {
  startDay: string
  every: Every
  interval: number
  /** Monthly only; none = the start's day of the month. */
  patterns: Array<Pattern>
  weekend: Weekend | null
  endDay: string | null
  endAfter: number | null
}

const MAX_PERIODS = 50_000

const iso = (date: Date) => format(date, 'yyyy-MM-dd')

function patternDate(p: Pattern, month: Date): Date | null {
  const first = startOfMonth(month)
  if (p.type === 'day') {
    if (p.day === -1) return lastDayOfMonth(first)
    return addDays(first, Math.min(p.day, getDaysInMonth(first)) - 1)
  }
  if (p.type === 'weekday') {
    if (p.nth === -1) {
      const last = lastDayOfMonth(first)
      return addDays(last, -((last.getDay() - p.weekday + 7) % 7))
    }
    const date = addDays(
      first,
      ((p.weekday - first.getDay() + 7) % 7) + (p.nth - 1) * 7,
    )
    return date.getMonth() === first.getMonth() ? date : null
  }
  const workdays: Array<Date> = []
  for (let d = 0; d < getDaysInMonth(first); d++) {
    const date = addDays(first, d)
    if (date.getDay() !== 0 && date.getDay() !== 6) workdays.push(date)
  }
  return (p.nth === -1 ? workdays.at(-1) : workdays[p.nth - 1]) ?? null
}

function moveOffWeekend(date: Date, weekend: Weekend | null) {
  const wd = date.getDay()
  if (!weekend || (wd !== 0 && wd !== 6)) return date
  if (weekend === 'before') return addDays(date, wd === 6 ? -1 : -2)
  return addDays(date, wd === 6 ? 2 : 1)
}

/** The scheduled days before any weekend move, in order. */
function* baseDays(s: Schedule): Generator<Date> {
  const start = parseISO(s.startDay)
  const step = Math.max(1, s.interval)
  for (let k = 0; k < MAX_PERIODS; k++) {
    const n = k * step
    if (s.every === 'day') yield addDays(start, n)
    else if (s.every === 'week') yield addWeeks(start, n)
    // From the start each time, so the 31st stays the 31st where it can.
    else if (s.every === 'year') yield addYears(start, n)
    else if (s.patterns.length === 0) yield addMonths(start, n)
    else {
      const month = addMonths(startOfMonth(start), n)
      const days = s.patterns
        .map((p) => patternDate(p, month))
        .filter((d): d is Date => d !== null && d >= start)
        .sort((a, b) => a.getTime() - b.getTime())
      let last = ''
      for (const d of days) {
        if (iso(d) === last) continue
        last = iso(d)
        yield d
      }
    }
  }
}

/** Every day it falls on (`YYYY-MM-DD`), in order, until it ends. */
export function* occurrences(s: Schedule): Generator<string> {
  let count = 0
  let last = ''
  for (const base of baseDays(s)) {
    if (s.endDay && iso(base) > s.endDay) return
    if (s.endAfter !== null && count >= s.endAfter) return
    count++
    const day = iso(moveOffWeekend(base, s.weekend))
    // Moving off a weekend can land on (or before) the previous one.
    if (day <= last) continue
    last = day
    yield day
  }
}

/** The days after `after` (null = from the start) up to `until`. */
export function dueDays(s: Schedule, after: string | null, until: string) {
  const days: Array<string> = []
  for (const day of occurrences(s)) {
    if (day > until) break
    if (!after || day > after) days.push(day)
  }
  return days
}

/** The next `n` days on or after `from` (not yet charged). */
export function upcoming(
  s: Schedule,
  from: string,
  chargedDay: string | null = null,
  n = 1,
) {
  const days: Array<string> = []
  for (const day of occurrences(s)) {
    if (day < from || (chargedDay && day <= chargedDay)) continue
    days.push(day)
    if (days.length >= n) break
  }
  return days
}

/** About how many times it falls in a month (for "about €X a month"). */
export function timesPerMonth(
  s: Pick<Schedule, 'every' | 'interval' | 'patterns'>,
) {
  const i = Math.max(1, s.interval)
  switch (s.every) {
    case 'day':
      return 365.25 / 12 / i
    case 'week':
      return 365.25 / 7 / 12 / i
    case 'month':
      return Math.max(1, s.patterns.length) / i
    case 'year':
      return 1 / 12 / i
  }
}

export function monthlyAmount(
  s: Pick<Schedule, 'every' | 'interval' | 'patterns'> & { cents: number },
) {
  return Math.round(s.cents * timesPerMonth(s))
}

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export function ordinal(n: number) {
  if (n === -1) return 'last'
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix}`
}

export function describePattern(p: Pattern) {
  if (p.type === 'day')
    return p.day === -1 ? 'the last day' : `the ${ordinal(p.day)}`
  if (p.type === 'weekday')
    return `the ${ordinal(p.nth)} ${WEEKDAYS[p.weekday]}`
  return `the ${ordinal(p.nth)} working day`
}

const UNIT = { day: 'day', week: 'week', month: 'month', year: 'year' }

/** "Every month on the last working day", "Every 2 weeks · until 3 Mar 2027". */
export function describeSchedule(s: Schedule) {
  const i = Math.max(1, s.interval)
  const start = parseISO(s.startDay)
  let text = i === 1 ? `Every ${UNIT[s.every]}` : `Every ${i} ${UNIT[s.every]}s`
  if (s.every === 'week') text += ` on ${WEEKDAYS[start.getDay()]}`
  if (s.every === 'month') {
    text +=
      s.patterns.length === 0
        ? ` on the ${ordinal(start.getDate())}`
        : ` on ${listJoin(s.patterns.map(describePattern))}`
  }
  if (s.every === 'year') text += ` on ${format(start, 'd MMM')}`
  if (s.weekend) {
    text +=
      s.weekend === 'before'
        ? ', Friday if on a weekend'
        : ', Monday if on a weekend'
  }
  if (s.endDay) text += ` · until ${format(parseISO(s.endDay), 'd MMM yyyy')}`
  else if (s.endAfter !== null) {
    text += ` · ${s.endAfter} time${s.endAfter === 1 ? '' : 's'}`
  }
  return text
}

function listJoin(parts: Array<string>) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
