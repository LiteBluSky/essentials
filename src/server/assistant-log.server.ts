import { count, desc, sql, sum } from 'drizzle-orm'

import { db } from '@/db'
import { assistantLog } from '@/db/schema'

// Server-only: the assistant's history (every request, its result and what
// it cost). Only import from *.functions.ts.

/** How many requests the history shows (the totals count all of them). */
export const HISTORY_LIMIT = 200

export type NewLogEntry = typeof assistantLog.$inferInsert

export async function logRequest(entry: NewLogEntry) {
  try {
    await db.insert(assistantLog).values(entry)
  } catch (error) {
    // Never let the log break the request itself.
    console.error('Assistant log failed:', error)
  }
}

export async function loadHistory() {
  const [entries, [totals]] = await Promise.all([
    db
      .select()
      .from(assistantLog)
      .orderBy(desc(assistantLog.createdAt), desc(assistantLog.id))
      .limit(HISTORY_LIMIT),
    db
      .select({
        requests: count(),
        costUsd: sum(assistantLog.costUsd).mapWith(Number),
        inputTokens: sum(assistantLog.inputTokens).mapWith(Number),
        outputTokens: sum(assistantLog.outputTokens).mapWith(Number),
        // Requests whose cost isn't known (no price for the model).
        unpriced:
          sql<number>`sum(case when ${assistantLog.costUsd} is null and ${assistantLog.inputTokens} is not null then 1 else 0 end)`.mapWith(
            Number,
          ),
      })
      .from(assistantLog),
  ])
  return { entries, totals }
}

export async function clearHistory() {
  await db.delete(assistantLog)
}
