import { z } from 'zod'

import { CATEGORY_KEYS } from './categories'
import { CURRENCIES } from './money'

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

export const subscriptionInput = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(200),
  cents,
  currency: z.enum(CURRENCIES),
  category: z.enum(CATEGORY_KEYS),
  every: z.enum(['month', 'year']),
  /** The first charge; then the same day every month / year. */
  startDay: day,
})
export type SubscriptionInput = z.infer<typeof subscriptionInput>

export const updateSubscriptionInput = subscriptionInput.extend({
  id: z.number().int().positive(),
})

export const budgetInput = z.object({
  category: z.enum(CATEGORY_KEYS),
  /** null removes the budget. */
  cents: cents.nullable(),
})

export const adviceInput = z.object({
  question: z.string().trim().max(2000),
  /** The month looked at, `YYYY-MM`. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
})

export const categorizeInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
})

export const byId = z.object({ id: z.number().int().positive() })
