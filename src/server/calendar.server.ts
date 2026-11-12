import { asc, eq, isNotNull } from 'drizzle-orm'

import { db } from '@/db'
import { calendarEvents, tasks } from '@/db/schema'
import type { EventInput } from '@/lib/calendar/schemas'

// Server-only DB helpers. Only import from *.functions.ts.

/** Every strip, plus the tasks with a due date (shown read-only on their
 * day; the browser works out which day, in its timezone). */
export async function loadCalendar() {
  const [events, dated] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .orderBy(asc(calendarEvents.startDay), asc(calendarEvents.id)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueAt: tasks.dueAt,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(isNotNull(tasks.dueAt)),
  ])
  return {
    events,
    tasks: dated.filter((t): t is typeof t & { dueAt: Date } => !!t.dueAt),
  }
}

export async function insertEvent(input: EventInput) {
  const [row] = await db
    .insert(calendarEvents)
    .values(input)
    .returning({ id: calendarEvents.id })
  return row
}

export async function editEvent(id: number, input: EventInput) {
  await db.update(calendarEvents).set(input).where(eq(calendarEvents.id, id))
}

export async function removeEvent(id: number) {
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
}
