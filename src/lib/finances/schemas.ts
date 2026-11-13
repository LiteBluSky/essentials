import { z } from 'zod'

import { CATEGORY_KEYS } from './categories'
import { CURRENCIES } from './money'
import { EVERY } from './schedule'

// Shared by the Finances forms and server functions.

/** A local day, `YYYY-MM-DD`. */
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a day')

const cents = z
  .number()
  .int()
  .positive('Enter an amount')
  .max(100_000_000_00, 'Too much')

export const entryInput = z.object({
  kind: z.enum(['expense', 'income']),
  cents,
  currency: z.enum(CURRENCIES),
  title: z.string().trim().max(200),
  category: z.enum(CATEGORY_KEYS),
  day,
})
export type EntryInput = z.infer<typeof entryInput>

export const newEntryInput = entryInput.extend({
  /** Ask the AI for a category after saving (only when none was picked). */
  autoCategorize: z.boolean(),
})

export const updateEntryInput = entryInput.extend({
  id: z.number().int().positive(),
})

const nth = (max: number) =>
  z
    .number()
    .int()
    .min(-1)
    .max(max)
    .refine((n) => n !== 0, 'Pick which one')

export const pattern = z.discriminatedUnion('type', [
  z.object({ type: z.literal('day'), day: nth(31) }),
  z.object({
    type: z.literal('weekday'),
    weekday: z.number().int().min(0).max(6),
    nth: nth(5),
  }),
  z.object({ type: z.literal('workday'), nth: nth(23) }),
])

/** Recurring money ("subscriptions" in the code): an expense or income. */
const subscriptionFields = z.object({
  kind: z.enum(['expense', 'income']),
  name: z.string().trim().min(1, 'Give it a name').max(200),
  cents,
  currency: z.enum(CURRENCIES),
  category: z.enum(CATEGORY_KEYS),
  every: z.enum(EVERY),
  interval: z.number().int().min(1, 'At least 1').max(366, 'Too many'),
  /** The first time; then on the schedule. */
  startDay: day,
  patterns: z.array(pattern).max(10),
  weekend: z.enum(['before', 'after']).nullable(),
  endDay: day.nullable(),
  endAfter: z.number().int().min(1, 'At least once').max(10_000).nullable(),
})

function checkSubscription(
  value: z.infer<typeof subscriptionFields>,
  ctx: z.RefinementCtx,
) {
  if (value.endDay && value.endDay < value.startDay) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDay'],
      message: 'Ends before it starts',
    })
  }
}

export const subscriptionInput =
  subscriptionFields.superRefine(checkSubscription)
export type SubscriptionInput = z.infer<typeof subscriptionInput>

export const updateSubscriptionInput = subscriptionFields
  .extend({ id: z.number().int().positive() })
  .superRefine(checkSubscription)

export const budgetInput = z.object({
  category: z.enum(CATEGORY_KEYS),
  /** null removes the budget. */
  cents: cents.nullable(),
})

export const adviceInput = z.object({
  question: z.string().trim().max(2000),
  /** The month looked at, `YYYY-MM`. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** Let Jarvis search the web for this question (off by default). */
  webSearch: z.boolean().default(false),
})

export const categorizeInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
})

export const byId = z.object({ id: z.number().int().positive() })
