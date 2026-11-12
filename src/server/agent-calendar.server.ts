import { and, asc, gte, lte } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { calendarEvents } from '@/db/schema'
import type { ChangeSummary } from '@/lib/assistant'
import { COLOR_KEYS, DEFAULT_COLOR } from '@/lib/calendar/colors'
import { day, eventInput } from '@/lib/calendar/schemas'
import type { EventInput } from '@/lib/calendar/schemas'
import type { RunContext } from './agent-tools.server'
import { editEvent, insertEvent, removeEvent } from './calendar.server'
import {
  deleteItemRecorded,
  getItem,
  recordCreate,
  recordUpdate,
} from './changes.server'
import type { ToolDef } from './llm.server'

// Server-only: the assistant's Calendar tools (Tell me and Chat). Strips
// are coloured bars over one day or a range of local days, no times; every
// change is recorded under the run like the other apps' (Undo).

/** How far ahead `list_calendar` looks by default. */
const LIST_DAYS = 90
const MAX_LISTED = 200

const COLOR_PARAM = {
  type: 'string',
  enum: COLOR_KEYS,
  description:
    'Only if the user named a colour: the closest of these. Omit otherwise.',
}

export const CALENDAR_TOOLS: Array<ToolDef> = [
  {
    name: 'list_calendar',
    description: `List the calendar's strips (coloured bars over a day or a range of days, no times) that overlap from_day..to_day (the user's local days, YYYY-MM-DD, inclusive). Default: from today, the next ${LIST_DAYS} days. Tasks with a due date also show on the calendar, but list_tasks lists those.`,
    parameters: {
      type: 'object',
      properties: {
        from_day: { type: 'string', description: 'First day, YYYY-MM-DD.' },
        to_day: { type: 'string', description: 'Last day, YYYY-MM-DD.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_calendar_strip',
    description:
      'Put a coloured strip on the calendar over one day or a range of days: something going on then (a trip, holiday, visit, event, busy week), with no time and no reminder. Not for something to do (that is a task, and tasks with a due date already show on the calendar).',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Short name, e.g. "Rome", "Mum visiting", "Conference". May be empty.',
        },
        start_day: {
          type: 'string',
          description: "First day, the user's local YYYY-MM-DD.",
        },
        end_day: {
          type: 'string',
          description: 'Last day (inclusive), YYYY-MM-DD. Omit for one day.',
        },
        color: COLOR_PARAM,
      },
      required: ['start_day'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_calendar_strip',
    description:
      'Change a calendar strip (an id from list_calendar): give only what changes — its name, colour, first or last day.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        title: { type: 'string' },
        start_day: { type: 'string' },
        end_day: { type: 'string' },
        color: COLOR_PARAM,
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_calendar_strip',
    description:
      'Delete a calendar strip (an id from list_calendar). Only when the user asked to remove it.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
]

const id = z.number().int().positive()
const color = z.enum(COLOR_KEYS)
const listArgs = z.object({
  from_day: day.optional(),
  to_day: day.optional(),
})
const createArgs = z.object({
  title: z.string().optional(),
  start_day: day,
  end_day: day.optional(),
  color: color.optional(),
})
const updateArgs = z.object({
  id,
  title: z.string().optional(),
  start_day: day.optional(),
  end_day: day.optional(),
  color: color.optional(),
})

/** Today in the user's timezone, `YYYY-MM-DD`. */
function today(timeZone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(isoDay: string, days: number) {
  const date = new Date(`${isoDay}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysLabel(input: EventInput) {
  return input.startDay === input.endDay
    ? input.startDay
    : `${input.startDay} → ${input.endDay}`
}

function stripOut(row: typeof calendarEvents.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    color: row.color,
    start_day: row.startDay,
    end_day: row.endDay,
  }
}

function changed(ctx: RunContext, summary: ChangeSummary) {
  ctx.result.changed.push(summary)
  return { changed: summary }
}

/** Runs a Calendar tool; undefined if `name` isn't one. */
export async function runCalendarTool(
  name: string,
  args: unknown,
  ctx: RunContext,
): Promise<unknown> {
  const bad = { error: `Bad arguments for ${name}` }
  switch (name) {
    case 'list_calendar': {
      const parsed = listArgs.safeParse(args ?? {})
      if (!parsed.success) return bad
      const from = parsed.data.from_day ?? today(ctx.timeZone)
      const to = parsed.data.to_day ?? addDays(from, LIST_DAYS)
      const rows = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            lte(calendarEvents.startDay, to),
            gte(calendarEvents.endDay, from),
          ),
        )
        .orderBy(asc(calendarEvents.startDay), asc(calendarEvents.id))
        .limit(MAX_LISTED)
      return { from_day: from, to_day: to, strips: rows.map(stripOut) }
    }
    case 'create_calendar_strip': {
      const parsed = createArgs.safeParse(args)
      if (!parsed.success) return bad
      const input = eventInput.safeParse({
        title: parsed.data.title ?? '',
        color: parsed.data.color ?? DEFAULT_COLOR,
        startDay: parsed.data.start_day,
        endDay: parsed.data.end_day ?? parsed.data.start_day,
      })
      if (!input.success) return { error: input.error.issues[0].message }
      const { id: stripId } = await insertEvent(input.data)
      const summary = {
        app: 'calendar' as const,
        target: 'item' as const,
        id: stripId,
        label: input.data.title || 'Untitled',
      }
      await recordCreate(ctx.runId, summary)
      return changed(ctx, {
        ...summary,
        op: 'create',
        detail: daysLabel(input.data),
      })
    }
    case 'update_calendar_strip': {
      const parsed = updateArgs.safeParse(args)
      if (!parsed.success) return bad
      const before = await getItem('calendar', parsed.data.id)
      if (!before) return { error: 'No calendar strip with that id' }
      const row = before as unknown as typeof calendarEvents.$inferSelect
      const input = eventInput.safeParse({
        title: parsed.data.title ?? row.title,
        color: parsed.data.color ?? row.color,
        startDay: parsed.data.start_day ?? row.startDay,
        endDay: parsed.data.end_day ?? row.endDay,
      })
      if (!input.success) return { error: input.error.issues[0].message }
      await editEvent(row.id, input.data)
      const summary = {
        app: 'calendar' as const,
        target: 'item' as const,
        id: row.id,
        label: input.data.title || row.title || 'Untitled',
      }
      await recordUpdate(ctx.runId, summary, before)
      return changed(ctx, {
        ...summary,
        op: 'update',
        detail: daysLabel(input.data),
      })
    }
    case 'delete_calendar_strip': {
      const parsed = z.object({ id }).safeParse(args)
      if (!parsed.success) return bad
      const stripId = parsed.data.id
      const label = await deleteItemRecorded(
        ctx.runId,
        'calendar',
        stripId,
        () => removeEvent(stripId),
      ).catch(() => null)
      if (label === null) return { error: 'No calendar strip with that id' }
      return changed(ctx, {
        app: 'calendar',
        target: 'item',
        op: 'delete',
        id: stripId,
        label,
      })
    }
  }
  return undefined
}
