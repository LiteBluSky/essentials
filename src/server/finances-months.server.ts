import { format } from 'date-fns'
import { and, eq, gte, lt, min, sql } from 'drizzle-orm'

import { db } from '@/db'
import type { Db } from '@/db'
import { financeEntries, financeMonths, financePending } from '@/db/schema'
import { addMonth, monthLabel, monthOf } from '@/lib/finances/money'

// Server-only: closing a month is the user's own step (never automatic).
// Once a new month starts, the month before stays open (its entries kept,
// still editable) until the user closes it: then its entries are folded
// into its report (`finance_months`, totals per category and currency)
// and deleted. While a past month is open nothing can be added to the
// current month (or later); a closed month takes nothing new. Months are
// closed oldest first, one at a time.

type Reader = Pick<Db, 'select'>

function currentMonth() {
  return monthOf(format(new Date(), 'yyyy-MM-dd'))
}

/** The oldest past month that still has entries or charges waiting to be
 * accepted, i.e. that needs closing; null when there's none. */
export async function openMonth(q: Reader = db) {
  const first = `${currentMonth()}-01`
  const [entries] = await q
    .select({ day: min(financeEntries.day) })
    .from(financeEntries)
    .where(lt(financeEntries.day, first))
  const [pending] = await q
    .select({ day: min(financePending.day) })
    .from(financePending)
    .where(lt(financePending.day, first))
  const days = [entries.day, pending.day].filter(
    (d): d is string => typeof d === 'string',
  )
  if (days.length === 0) return null
  return monthOf(days.sort()[0])
}

async function isClosed(month: string, q: Reader) {
  const rows = await q
    .select({ month: financeMonths.month })
    .from(financeMonths)
    .where(eq(financeMonths.month, month))
    .limit(1)
  return rows.length > 0
}

/** Throws unless an entry on `day` may be added: not in a closed month, and
 * not in this month (or later) while a past month is still open. */
export async function assertCanAdd(day: string, q: Reader = db) {
  const month = monthOf(day)
  const current = currentMonth()
  if (month < current) {
    if (await isClosed(month, q)) {
      throw new Error(`${monthLabel(month)} is already closed`)
    }
    return
  }
  const open = await openMonth(q)
  if (open) {
    throw new Error(
      `Close ${monthLabel(open)} first (in Finances) before adding to ${monthLabel(month)}`,
    )
  }
}

/** Closes the oldest open month: its entries are folded into its report
 * and deleted. Refused while it still has charges waiting to be accepted.
 * Returns the month closed. */
export async function closeMonth() {
  const month = await openMonth()
  if (!month) throw new Error('There is no past month to close')
  const first = `${month}-01`
  const next = `${addMonth(month, 1)}-01`
  return db.transaction(async (tx) => {
    const waiting = await tx
      .select({ id: financePending.id })
      .from(financePending)
      .where(and(gte(financePending.day, first), lt(financePending.day, next)))
    if (waiting.length > 0) {
      throw new Error(
        `Accept or skip the ${waiting.length} recurring ${waiting.length === 1 ? 'charge' : 'charges'} of ${monthLabel(month)} first`,
      )
    }
    const inMonth = and(
      gte(financeEntries.day, first),
      lt(financeEntries.day, next),
    )
    const rows = await tx.select().from(financeEntries).where(inMonth)
    const lines = new Map<
      string,
      {
        month: string
        kind: 'expense' | 'income'
        category: string
        currency: string
        cents: number
        count: number
      }
    >()
    for (const e of rows) {
      const key = `${e.kind}|${e.category}|${e.currency}`
      const line = lines.get(key)
      if (line) {
        line.cents += e.cents
        line.count++
      } else {
        lines.set(key, {
          month,
          kind: e.kind,
          category: e.category,
          currency: e.currency,
          cents: e.cents,
          count: 1,
        })
      }
    }
    for (const line of lines.values()) {
      await tx
        .insert(financeMonths)
        .values(line)
        .onConflictDoUpdate({
          target: [
            financeMonths.month,
            financeMonths.kind,
            financeMonths.category,
            financeMonths.currency,
          ],
          set: {
            cents: sql`${financeMonths.cents} + ${line.cents}`,
            count: sql`${financeMonths.count} + ${line.count}`,
          },
        })
    }
    await tx.delete(financeEntries).where(inMonth)
    return month
  })
}
