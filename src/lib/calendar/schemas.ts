import { z } from 'zod'

import { COLOR_KEYS } from './colors'

// Shared by the event form and the server functions.

/** A local calendar day, `YYYY-MM-DD`. */
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a day')

const eventFields = z.object({
  title: z.string().trim().max(200),
  color: z.enum(COLOR_KEYS),
  startDay: day,
  endDay: day,
})

const inOrder = (v: { startDay: string; endDay: string }) =>
  v.startDay <= v.endDay

export const eventInput = eventFields.refine(inOrder, {
  message: 'It ends before it starts',
  path: ['endDay'],
})
export type EventInput = z.infer<typeof eventInput>

export const updateEventInput = eventFields
  .extend({ id: z.number().int().positive() })
  .refine(inOrder, { message: 'It ends before it starts', path: ['endDay'] })

export const byId = z.object({ id: z.number().int().positive() })
