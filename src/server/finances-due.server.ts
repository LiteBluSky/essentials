import { format } from 'date-fns'
import { and, asc, eq, isNull, lte } from 'drizzle-orm'

import { db } from '@/db'
import type { Db } from '@/db'
import {
  financeEntries,
  financePending,
  financeSubscriptions,
} from '@/db/schema'
import { formatMoney } from '@/lib/finances/money'
import { assertCanAdd } from './finances-months.server'
import { dueDays } from '@/lib/finances/schedule'

// Server-only: recurring expenses and income are never added on their own.
// Each day one falls on, a copy waits in `finance_pending` until the user
// accepts it (it becomes an entry on that day) or skips it; from
// `PAYMENT_REMIND_HOUR` that day it's pushed to the phone once. Queued
// whenever Finances loads and by the reminder tick (so the push goes out
// without opening the app). Kept apart from finances.server.ts so the
// reminders don't pull in the AI code.

/** Due recurring money is pushed from this hour (the server's local time;
 * Docker: set TZ). */
export const PAYMENT_REMIND_HOUR = 9

export function localDay(now = new Date()) {
  return format(now, 'yyyy-MM-dd')
}

/** Queues a pending charge for each day a recurring expense / income fell
 * on by `day` (local `YYYY-MM-DD`). */
export async function queueDue(day: string, data: Db = db) {
  const subs = await data.select().from(financeSubscriptions)
  for (const sub of subs) {
    const due = dueDays(sub, sub.chargedDay, day)
    if (due.length === 0) continue
    await data.transaction(async (tx) => {
      await tx
        .insert(financePending)
        .values(
          due.map((charge) => ({
            subscriptionId: sub.id,
            kind: sub.kind,
            cents: sub.cents,
            currency: sub.currency,
            title: sub.name,
            category: sub.category,
            day: charge,
          })),
        )
        .onConflictDoNothing()
      await tx
        .update(financeSubscriptions)
        .set({ chargedDay: due[due.length - 1] })
        .where(eq(financeSubscriptions.id, sub.id))
    })
  }
}

export function listPending(data: Db = db) {
  return data
    .select()
    .from(financePending)
    .orderBy(asc(financePending.day), asc(financePending.id))
}

/** Turns a pending charge into an entry on its day; returns the entry's
 * id, or null if it was already accepted / skipped. */
export async function acceptPending(id: number) {
  return db.transaction(async (tx) => {
    const p = (
      await tx.select().from(financePending).where(eq(financePending.id, id))
    ).at(0)
    if (!p) return null
    await assertCanAdd(p.day, tx)
    const [entry] = await tx
      .insert(financeEntries)
      .values({
        kind: p.kind,
        cents: p.cents,
        currency: p.currency,
        title: p.title,
        category: p.category,
        day: p.day,
        subscriptionId: p.subscriptionId,
      })
      .returning({ id: financeEntries.id })
    await tx.delete(financePending).where(eq(financePending.id, id))
    return entry.id
  })
}

/** Drops a pending charge: it didn't happen (or not like that). */
export async function skipPending(id: number) {
  await db.delete(financePending).where(eq(financePending.id, id))
}

/** From `PAYMENT_REMIND_HOUR`, queues what fell due and pushes each pending
 * charge not pushed yet ("−€12.99 today · accept it in Finances"); one
 * from an earlier day (the server was off) goes out late, since it still
 * waits. Returns how many went out. */
export async function sendPaymentReminders(
  push: (p: {
    title: string
    message: string
    tags: string
    path: string
  }) => Promise<void>,
  now = new Date(),
  data: Db = db,
  label?: string,
) {
  if (now.getHours() < PAYMENT_REMIND_HOUR) return 0
  const today = localDay(now)
  await queueDue(today, data)
  const due = await data
    .select()
    .from(financePending)
    .where(
      and(isNull(financePending.notifiedAt), lte(financePending.day, today)),
    )
  let sent = 0
  for (const p of due) {
    const sign = p.kind === 'income' ? '+' : '−'
    try {
      await push({
        title: p.title || (p.kind === 'income' ? 'Income' : 'Payment'),
        message: [
          `${sign}${formatMoney(p.cents, p.currency)} ${p.day === today ? 'today' : `on ${p.day}`}`,
          'accept it in Finances',
          label,
        ]
          .filter(Boolean)
          .join(' · '),
        tags: 'moneybag',
        path: '/finances',
      })
      await data
        .update(financePending)
        .set({ notifiedAt: now })
        .where(eq(financePending.id, p.id))
      sent++
    } catch (error) {
      console.error(`Reminder for pending charge ${p.id} failed:`, error)
    }
  }
  return sent
}
