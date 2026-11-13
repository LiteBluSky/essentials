import type { EntryKind } from './categories'
import { monthOf } from './money'

// A month's totals (pure). The current month (and later ones) come from its
// entries; a past month from its saved report (the entries are gone). What
// was left at the end of a month (or overspent) carries over into the next:
// a month's "left" = carried over + in − out.

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
  /** Left over from every month before (negative = overspent). */
  carried: number
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

/** What every month before `month` left over, per currency (in − out). */
export function carriedInto(
  month: string,
  entries: Array<EntryLike>,
  reports: Array<ReportRow>,
) {
  const carried = new Map<string, number>()
  const add = (kind: EntryKind, currency: string, cents: number) =>
    carried.set(
      currency,
      (carried.get(currency) ?? 0) + (kind === 'income' ? cents : -cents),
    )
  for (const e of entries) {
    if (monthOf(e.day) < month) add(e.kind, e.currency, e.cents)
  }
  for (const r of reports) {
    if (r.month < month) add(r.kind, r.currency, r.cents)
  }
  return carried
}

/** A month's totals per currency, with what carried over into it. */
export function monthTotals(
  month: string,
  entries: Array<EntryLike>,
  reports: Array<ReportRow>,
) {
  return totalsByCurrency(
    monthLines(month, entries, reports),
    carriedInto(month, entries, reports),
  )
}

/** A month's totals per currency; euros (the default) first. A currency
 * with only something carried over still shows. */
export function totalsByCurrency(
  lines: Array<Line>,
  carried: Map<string, number> = new Map(),
): Array<CurrencyTotals> {
  const byCurrency = new Map<string, CurrencyTotals>()
  const totalsOf = (currency: string) => {
    let t = byCurrency.get(currency)
    if (!t) {
      t = {
        currency,
        carried: carried.get(currency) ?? 0,
        income: 0,
        spent: 0,
        expenses: [],
        incomes: [],
      }
      byCurrency.set(currency, t)
    }
    return t
  }
  for (const [currency, cents] of carried) if (cents !== 0) totalsOf(currency)
  for (const line of lines) {
    const t = totalsOf(line.currency)
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
