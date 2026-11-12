import { addDays, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'

// Pure helpers for the month grid: which strip goes in which row ("lane")
// of each week, so a strip over several days stays on one line.

/** Weeks start on Monday (the grid and the lanes must agree). */
export const WEEK_STARTS_ON = 1

/** The grid always shows 6 weeks (DayPicker's `fixedWeeks`). */
const WEEKS = 6

export type Strip = {
  /** Unique across kinds, e.g. `event-3` / `task-7`. */
  key: string
  kind: 'event' | 'task'
  id: number
  title: string
  /** First and last day, inclusive (`YYYY-MM-DD`). */
  start: string
  end: string
  color?: string
  done?: boolean
}

/** One lane of one day: empty, covered by a strip drawn in an earlier day of
 * the week, or where a strip's piece for this week starts (`span` days). */
export type Slot =
  | null
  | 'covered'
  | {
      strip: Strip
      span: number
      /** Started in an earlier week / goes on into the next one. */
      continued: boolean
      continues: boolean
    }

export function isoDay(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export function parseDay(day: string) {
  return parseISO(day)
}

/** The 6 weeks of days (`YYYY-MM-DD`) the grid shows for `month`. */
export function monthWeeks(month: Date): Array<Array<string>> {
  const first = startOfWeek(startOfMonth(month), {
    weekStartsOn: WEEK_STARTS_ON,
  })
  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (__, d) => isoDay(addDays(first, w * 7 + d))),
  )
}

/** Earlier first, then longer, events before tasks, then oldest. */
function byStart(a: Strip, b: Strip) {
  return (
    a.start.localeCompare(b.start) ||
    b.end.localeCompare(a.end) ||
    (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1) ||
    a.id - b.id
  )
}

/** Each shown day's lanes. Every day of a week has as many lanes as the
 * busiest day of that week needs, so the strips line up. */
export function layoutWeeks(
  weeks: Array<Array<string>>,
  strips: Array<Strip>,
): Map<string, Array<Slot>> {
  const out = new Map<string, Array<Slot>>()
  const sorted = [...strips].sort(byStart)
  for (const days of weeks) {
    const first = days[0]
    const last = days[days.length - 1]
    // Each lane's last occupied day.
    const lanes: Array<string> = []
    const placed: Array<{
      strip: Strip
      lane: number
      from: number
      to: number
    }> = []
    for (const strip of sorted) {
      if (strip.start > last || strip.end < first) continue
      const from = strip.start < first ? first : strip.start
      const to = strip.end > last ? last : strip.end
      let lane = lanes.findIndex((end) => end < from)
      if (lane === -1) lane = lanes.push(to) - 1
      else lanes[lane] = to
      placed.push({
        strip,
        lane,
        from: days.indexOf(from),
        to: days.indexOf(to),
      })
    }
    const week: Array<Array<Slot>> = days.map(() => lanes.map(() => null))
    for (const { strip, lane, from, to } of placed) {
      week[from][lane] = {
        strip,
        span: to - from + 1,
        continued: strip.start < first,
        continues: strip.end > last,
      }
      for (let d = from + 1; d <= to; d++) week[d][lane] = 'covered'
    }
    days.forEach((day, i) => out.set(day, week[i]))
  }
  return out
}

/** The range between two picked days, in order. */
export function orderedRange(a: string, b: string) {
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}
