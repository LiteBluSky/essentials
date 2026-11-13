import { addMonths, addYears, format, parseISO } from 'date-fns'

import type { EntryKind } from './categories'
import { monthOf } from './money'

// A month's totals (pure). The current month (and later ones) come from its
// entries; a past month from its saved report (the entries are gone).

export type Line = {
  kind: EntryKind
  category: string
  currency: string
  cents: number
  count: number
}

type EntryLike = {
  kind: EntryKind
  category: string
  currency: string
  cents: number
  day: string
}

type ReportRow = Line & { month: string }

export type CurrencyTotals = {
  currency: string
  income: number
  spent: number
  /** Expenses per category, biggest first. */
  expenses: Array<Line>
  /** Income per category, biggest first. */
  incomes: Array<Line>
}

/** Lines per kind / category / currency for one month. */
export function monthLines(
  month: string,
  entries: Array<EntryLike>,
  reports: Array<ReportRow>,
): Array<Line> {
  const lines = new Map<string, Line>()
  const add = (l: Omit<Line, 'count'>, count: number) => {
    const key = `${l.kind}|${l.category}|${l.currency}`
    const line = lines.get(key)
    if (line) {
      line.cents += l.cents
      line.count += count
    } else {
      lines.set(key, { ...l, count })
    }
  }
  for (const e of entries) if (monthOf(e.day) === month) add(e, 1)
  for (const r of reports) if (r.month === month) add(r, r.count)
  return [...lines.values()]
}

/** A month's totals per currency; euros (the default) first. */
export function totalsByCurrency(lines: Array<Line>): Array<CurrencyTotals> {
  const byCurrency = new Map<string, CurrencyTotals>()
  for (const line of lines) {
    let t = byCurrency.get(line.currency)
    if (!t) {
      t = {
        currency: line.currency,
        income: 0,
        spent: 0,
        expenses: [],
        incomes: [],
      }
      byCurrency.set(line.currency, t)
    }
    if (line.kind === 'income') {
      t.income += line.cents
      t.incomes.push(line)
    } else {
      t.spent += line.cents
      t.expenses.push(line)
    }
  }
  const all = [...byCurrency.values()]
  for (const t of all) {
    t.expenses.sort((a, b) => b.cents - a.cents)
    t.incomes.sort((a, b) => b.cents - a.cents)
  }
  return all.sort((a, b) =>
    a.currency === 'EUR' ? -1 : b.currency === 'EUR' ? 1 : 0,
  )
}

/** What a subscription costs per month (yearly ones spread out). */
export function monthlyCost(sub: { cents: number; every: 'month' | 'year' }) {
  return sub.every === 'year' ? Math.round(sub.cents / 12) : sub.cents
}

/** A subscription's `n`th charge from its start: the same day each month /
 * year (the 31st is the month's last day when shorter). */
export function chargeDay(
  startDay: string,
  every: 'month' | 'year',
  n: number,
) {
  const start = parseISO(startDay)
  return format(
    every === 'year' ? addYears(start, n) : addMonths(start, n),
    'yyyy-MM-dd',
  )
}

/** The first charge after `day` (or on it, if not charged yet). */
export function nextCharge(
  sub: { startDay: string; every: 'month' | 'year'; chargedDay: string | null },
  day: string,
) {
  for (let n = 0; n < 1200; n++) {
    const charge = chargeDay(sub.startDay, sub.every, n)
    if (charge >= day && (!sub.chargedDay || charge > sub.chargedDay)) {
      return charge
    }
  }
  return null
}
