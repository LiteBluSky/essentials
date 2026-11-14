import { getDaysInMonth } from 'date-fns'

import { category } from './categories'

// Budgets at work: how much of each monthly budget (euros) a month has
// used, what's left and where the month is heading at this pace. Shared by
// the Budgets tab and the budget alerts pushed to the phone (pure).

/** A budget is "nearly used up" from this share of it. */
export const BUDGET_WARN = 0.8

export type BudgetLine = {
  category: string
  label: string
  color: string
  budget: number
  spent: number
  /** budget − spent (negative = over). */
  left: number
  /** spent / budget. */
  ratio: number
  /** What the month would end on at this pace; null for other months
   * than `today`'s, or before anything was spent. */
  projected: number | null
}

type EntryLike = {
  kind: string
  currency: string
  category: string
  cents: number
  day: string
}

/** Each budget's line for `month` (`YYYY-MM`), most used first. Only euro
 * expenses count (budgets are in euros). */
export function budgetLines(
  budgets: Array<{ category: string; cents: number }>,
  entries: Array<EntryLike>,
  month: string,
  today: string,
): Array<BudgetLine> {
  const spent = new Map<string, number>()
  for (const e of entries) {
    if (e.kind !== 'expense' || e.currency !== 'EUR') continue
    if (!e.day.startsWith(`${month}-`)) continue
    spent.set(e.category, (spent.get(e.category) ?? 0) + e.cents)
  }
  const current = today.startsWith(`${month}-`)
  const day = Number(today.slice(8, 10))
  const days = getDaysInMonth(new Date(`${month}-01T12:00:00`))
  return budgets
    .map((b) => {
      const used = spent.get(b.category) ?? 0
      const c = category(b.category)
      return {
        category: b.category,
        label: c.label,
        color: c.color,
        budget: b.cents,
        spent: used,
        left: b.cents - used,
        ratio: b.cents > 0 ? used / b.cents : 0,
        projected: current && used > 0 ? Math.round((used / day) * days) : null,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

/** The alert a line has reached: 100 over budget, 80 nearly used up. */
export function alertLevel(line: BudgetLine): 0 | 80 | 100 {
  if (line.ratio >= 1) return 100
  if (line.ratio >= BUDGET_WARN) return 80
  return 0
}
