import { z } from 'zod'

import type { ChangeSummary } from '@/lib/assistant'
import {
  CATEGORY_KEYS,
  UNCATEGORIZED,
  categoriesFor,
  category,
} from '@/lib/finances/categories'
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from '@/lib/finances/money'
import { day, entryInput, subscriptionInput } from '@/lib/finances/schemas'
import { monthLines, totalsByCurrency } from '@/lib/finances/summary'
import type { RunContext } from './agent-tools.server'
import {
  deleteItemRecorded,
  getItem,
  recordCreate,
  recordUpdate,
} from './changes.server'
import {
  editEntry,
  insertEntry,
  insertSubscription,
  loadFinances,
  removeEntry,
  removeSubscription,
} from './finances.server'
import type { ToolDef } from './llm.server'

// Server-only: the assistant's Finances tools (Tell me and Chat). Every
// change is recorded under the run (Undo), entries as `finances` items and
// subscriptions as `subscriptions` items.

const CATEGORY_PARAM = {
  type: 'string',
  enum: CATEGORY_KEYS,
  description: `Expenses: ${categoriesFor('expense')
    .map((c) => c.key)
    .join(', ')}. Income: ${categoriesFor('income')
    .map((c) => c.key)
    .join(
      ', ',
    )}. Pick the one that fits what it was; "${UNCATEGORIZED}" only if nothing is known.`,
}
const CURRENCY_PARAM = {
  type: 'string',
  enum: CURRENCIES,
  description: `Only if the user said another currency. Default ${DEFAULT_CURRENCY}.`,
}

export const FINANCE_TOOLS: Array<ToolDef> = [
  {
    name: 'add_money_entry',
    description:
      'Record money spent (an expense: "spent 12.50 on lunch", "paid 40 for petrol") or received (income: payroll, a friend paying back) in Finances. Not for something to buy later (that is a task).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['expense', 'income'] },
        amount: {
          type: 'number',
          description: 'Positive amount, e.g. 12.5.',
        },
        title: {
          type: 'string',
          description: 'What it was, short ("Lunch", "Payroll"). May be empty.',
        },
        category: CATEGORY_PARAM,
        currency: CURRENCY_PARAM,
        day: {
          type: 'string',
          description: "The user's local day, YYYY-MM-DD. Default today.",
        },
      },
      required: ['kind', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_finances',
    description:
      "The user's money for a month (YYYY-MM, default this month): totals per category and currency, this month's entries with ids, subscriptions and budgets. Past months only keep totals (their entries are gone).",
    parameters: {
      type: 'object',
      properties: { month: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'update_money_entry',
    description:
      'Change an entry (an id from list_finances): give only what changes.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        kind: { type: 'string', enum: ['expense', 'income'] },
        amount: { type: 'number' },
        title: { type: 'string' },
        category: CATEGORY_PARAM,
        currency: CURRENCY_PARAM,
        day: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_money_entry',
    description:
      'Delete an entry (an id from list_finances). Only when asked to.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_subscription',
    description:
      'Add a subscription (Netflix, gym, phone plan…): charged automatically as an expense on its start day and the same day every month or year.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        every: { type: 'string', enum: ['month', 'year'] },
        start_day: {
          type: 'string',
          description: 'First (or next) charge, YYYY-MM-DD. Default today.',
        },
        category: CATEGORY_PARAM,
        currency: CURRENCY_PARAM,
      },
      required: ['name', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_subscription',
    description:
      'Stop a subscription (an id from list_finances); what it already charged stays. Only when asked to.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
]

const id = z.number().int().positive()
const amount = z.number().positive()
const kind = z.enum(['expense', 'income'])
const categoryKey = z.enum(CATEGORY_KEYS)
const currency = z.enum(CURRENCIES)
const addArgs = z.object({
  kind,
  amount,
  title: z.string().optional(),
  category: categoryKey.optional(),
  currency: currency.optional(),
  day: day.optional(),
})
const updateArgs = z.object({
  id,
  kind: kind.optional(),
  amount: amount.optional(),
  title: z.string().optional(),
  category: categoryKey.optional(),
  currency: currency.optional(),
  day: day.optional(),
})
const subArgs = z.object({
  name: z.string(),
  amount,
  every: z.enum(['month', 'year']).optional(),
  start_day: day.optional(),
  category: categoryKey.optional(),
  currency: currency.optional(),
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

const toCents = (n: number) => Math.round(n * 100)

/** A category that fits the kind (an expense category on income doesn't). */
function fitCategory(k: 'expense' | 'income', key: string | undefined) {
  return key && categoriesFor(k).some((c) => c.key === key)
    ? key
    : UNCATEGORIZED
}

function changed(ctx: RunContext, summary: ChangeSummary) {
  ctx.result.changed.push(summary)
  return { changed: summary }
}

/** Runs a Finances tool; undefined if `name` isn't one. */
export async function runFinanceTool(
  name: string,
  args: unknown,
  ctx: RunContext,
): Promise<unknown> {
  const bad = { error: `Bad arguments for ${name}` }
  switch (name) {
    case 'add_money_entry': {
      const parsed = addArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const input = entryInput.safeParse({
        kind: a.kind,
        cents: toCents(a.amount),
        currency: a.currency ?? DEFAULT_CURRENCY,
        title: a.title ?? '',
        category: fitCategory(a.kind, a.category),
        day: a.day ?? today(ctx.timeZone),
      })
      if (!input.success) return { error: input.error.issues[0].message }
      const { id: entryId } = await insertEntry(input.data)
      const summary = {
        app: 'finances' as const,
        target: 'item' as const,
        id: entryId,
        label: input.data.title || category(input.data.category).label,
      }
      await recordCreate(ctx.runId, summary)
      return changed(ctx, {
        ...summary,
        op: 'create',
        detail: `${input.data.kind === 'income' ? '+' : '−'}${formatMoney(input.data.cents, input.data.currency)} · ${category(input.data.category).label}`,
      })
    }
    case 'list_finances': {
      const parsed = z
        .object({
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        })
        .safeParse(args ?? {})
      if (!parsed.success) return bad
      const data = await loadFinances()
      const month = parsed.data.month ?? data.month
      const totals = totalsByCurrency(
        monthLines(month, data.entries, data.reports),
      ).map((t) => ({
        currency: t.currency,
        income: t.income / 100,
        spent: t.spent / 100,
        left: (t.income - t.spent) / 100,
        by_category: [...t.expenses, ...t.incomes].map((l) => ({
          kind: l.kind,
          category: l.category,
          amount: l.cents / 100,
        })),
      }))
      return {
        month,
        today: data.today,
        totals,
        entries: data.entries
          .filter((e) => e.day.startsWith(month))
          .slice(0, 200)
          .map((e) => ({
            id: e.id,
            kind: e.kind,
            amount: e.cents / 100,
            currency: e.currency,
            title: e.title,
            category: e.category,
            day: e.day,
            subscription: e.subscriptionId !== null,
          })),
        subscriptions: data.subscriptions.map((s) => ({
          id: s.id,
          name: s.name,
          amount: s.cents / 100,
          currency: s.currency,
          every: s.every,
          category: s.category,
          start_day: s.startDay,
        })),
        budgets: data.budgets.map((b) => ({
          category: b.category,
          amount_eur: b.cents / 100,
        })),
      }
    }
    case 'update_money_entry': {
      const parsed = updateArgs.safeParse(args)
      if (!parsed.success) return bad
      const before = await getItem('finances', parsed.data.id)
      if (!before) return { error: 'No entry with that id' }
      const row = before as unknown as {
        id: number
        kind: 'expense' | 'income'
        cents: number
        currency: string
        title: string
        category: string
        day: string
      }
      const a = parsed.data
      const k = a.kind ?? row.kind
      const input = entryInput.safeParse({
        kind: k,
        cents: a.amount === undefined ? row.cents : toCents(a.amount),
        currency: a.currency ?? row.currency,
        title: a.title ?? row.title,
        category: fitCategory(k, a.category ?? row.category),
        day: a.day ?? row.day,
      })
      if (!input.success) return { error: input.error.issues[0].message }
      await editEntry(row.id, input.data)
      const summary = {
        app: 'finances' as const,
        target: 'item' as const,
        id: row.id,
        label: input.data.title || category(input.data.category).label,
      }
      await recordUpdate(ctx.runId, summary, before)
      return changed(ctx, {
        ...summary,
        op: 'update',
        detail: `${formatMoney(input.data.cents, input.data.currency)} · ${category(input.data.category).label}`,
      })
    }
    case 'delete_money_entry':
    case 'delete_subscription': {
      const parsed = z.object({ id }).safeParse(args)
      if (!parsed.success) return bad
      const itemId = parsed.data.id
      const app =
        name === 'delete_money_entry'
          ? ('finances' as const)
          : ('subscriptions' as const)
      const label = await deleteItemRecorded(ctx.runId, app, itemId, () =>
        app === 'finances' ? removeEntry(itemId) : removeSubscription(itemId),
      ).catch(() => null)
      if (label === null) return { error: 'Nothing with that id' }
      return changed(ctx, {
        app,
        target: 'item',
        op: 'delete',
        id: itemId,
        label,
      })
    }
    case 'add_subscription': {
      const parsed = subArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const input = subscriptionInput.safeParse({
        name: a.name,
        cents: toCents(a.amount),
        currency: a.currency ?? DEFAULT_CURRENCY,
        category: fitCategory('expense', a.category ?? 'subscriptions'),
        every: a.every ?? 'month',
        startDay: a.start_day ?? today(ctx.timeZone),
      })
      if (!input.success) return { error: input.error.issues[0].message }
      const { id: subId } = await insertSubscription(input.data)
      const summary = {
        app: 'subscriptions' as const,
        target: 'item' as const,
        id: subId,
        label: input.data.name,
      }
      await recordCreate(ctx.runId, summary)
      return changed(ctx, {
        ...summary,
        op: 'create',
        detail: `${formatMoney(input.data.cents, input.data.currency)}/${input.data.every}`,
      })
    }
  }
  return undefined
}
