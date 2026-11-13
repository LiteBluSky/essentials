import { z } from 'zod'

import type { FinanceSubscription } from '@/db/schema'
import type { ChangeSummary } from '@/lib/assistant'
import {
  CATEGORY_KEYS,
  UNCATEGORIZED,
  categoriesFor,
  category,
} from '@/lib/finances/categories'
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from '@/lib/finances/money'
import {
  day,
  entryInput,
  pattern,
  subscriptionInput,
} from '@/lib/finances/schemas'
import { EVERY, describeSchedule, upcoming } from '@/lib/finances/schedule'
import { monthTotals } from '@/lib/finances/summary'
import type { RunContext } from './agent-tools.server'
import {
  deleteItemRecorded,
  getItem,
  recordBudget,
  recordCreate,
  recordUpdate,
} from './changes.server'
import {
  editEntry,
  editSubscription,
  insertEntry,
  insertSubscription,
  loadFinances,
  removeEntry,
  removeSubscription,
  setBudget,
} from './finances.server'
import type { ToolDef } from './llm.server'

// Server-only: the assistant's Finances tools (Tell me and Chat). Every
// change is recorded under the run (Undo), entries as `finances` items and
// recurring expenses / income as `subscriptions` items.

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

const RECURRING_PROPS = {
  kind: { type: 'string', enum: ['expense', 'income'] },
  name: { type: 'string' },
  amount: { type: 'number' },
  every: { type: 'string', enum: EVERY, description: 'Default month.' },
  interval: {
    type: 'integer',
    description: 'Every N (default 1; 2 = every other).',
  },
  start_day: {
    type: 'string',
    description:
      'First (or next) time, YYYY-MM-DD. Default today. For weekly ones it sets the weekday; monthly without days, the day of the month.',
  },
  days: {
    type: 'array',
    description:
      'Monthly only: the days of the month. day: 1–31 or -1 (last day). weekday: 0 Sunday … 6 Saturday with nth 1–5 or -1 (last). workday: the nth Mon–Fri, -1 = last.',
    items: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['day', 'weekday', 'workday'] },
        day: { type: 'integer' },
        weekday: { type: 'integer' },
        nth: { type: 'integer' },
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
  weekend: {
    type: 'string',
    enum: ['before', 'after'],
    description:
      'When a day falls on a weekend: the Friday before or the Monday after. Omit to keep it.',
  },
  end_day: {
    type: 'string',
    description: 'Last possible day, YYYY-MM-DD.',
  },
  times: { type: 'integer', description: 'Ends after this many times.' },
  category: CATEGORY_PARAM,
  currency: CURRENCY_PARAM,
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
      "The user's money for a month (YYYY-MM, default this month): totals per category and currency (left = carried over from earlier months + in − out), this month's entries with ids, recurring expenses / income, what fell due and waits for the user to accept it (to_accept: not counted until they do, in Finances) and budgets. Closed months only keep totals (their entries are gone). The user closes each past month themselves in Finances; until the last one is closed (month_to_close) nothing can be added to this month, only to that month.",
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
    name: 'add_recurring',
    description:
      'Add recurring money: an expense (rent, Netflix, gym, phone plan…) or income (salary, rent received…), on each day of its schedule the user is notified and accepts it in Finances, which adds it as an entry. Like Actual Budget: every N days / weeks / months / years from start_day; a monthly one can fall on chosen days of the month instead (e.g. salary on the last working day: every month, days [{type:"workday", nth:-1}]; the 1st and 15th: [{type:"day", day:1},{type:"day", day:15}]; the 2nd Friday: [{type:"weekday", weekday:5, nth:2}]). Optional: move a weekend day to the Friday before / Monday after, end on a day or after a number of times.',
    parameters: {
      type: 'object',
      properties: RECURRING_PROPS,
      required: ['kind', 'name', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_recurring',
    description:
      'Stop a recurring expense or income (an id from list_finances); the entries already accepted stay, what still waits to be accepted is dropped. Only when asked to.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_recurring',
    description:
      "Change a recurring expense or income (an id from list_finances): give only what changes. Changing the schedule re-plans what is still to come; what was already accepted stays (switching expense / income also fixes this month's entries it added).",
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' }, ...RECURRING_PROPS },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_budget',
    description:
      'Set, change or remove the monthly budget (in euros) of an expense category. amount 0 removes it. See current budgets with list_finances.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: categoriesFor('expense').map((c) => c.key),
        },
        amount: {
          type: 'number',
          description: 'Euros a month; 0 = no budget.',
        },
      },
      required: ['category', 'amount'],
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
  kind,
  name: z.string(),
  amount,
  every: z.enum(EVERY).optional(),
  interval: z.number().int().optional(),
  start_day: day.optional(),
  days: z.array(pattern).optional(),
  weekend: z.enum(['before', 'after']).optional(),
  end_day: day.optional(),
  times: z.number().int().optional(),
  category: categoryKey.optional(),
  currency: currency.optional(),
})

const updateSubArgs = subArgs.partial().extend({ id })
const budgetArgs = z.object({
  category: categoryKey,
  amount: z.number().min(0),
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
      const totals = monthTotals(month, data.entries, data.reports).map(
        (t) => ({
          currency: t.currency,
          income: t.income / 100,
          spent: t.spent / 100,
          carried_over: t.carried / 100,
          left: (t.carried + t.income - t.spent) / 100,
          by_category: [...t.expenses, ...t.incomes].map((l) => ({
            kind: l.kind,
            category: l.category,
            amount: l.cents / 100,
          })),
        }),
      )
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
            recurring: e.subscriptionId !== null,
          })),
        recurring: data.subscriptions.map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          amount: s.cents / 100,
          currency: s.currency,
          schedule: describeSchedule(s),
          every: s.every,
          interval: s.interval,
          start_day: s.startDay,
          days: s.patterns,
          weekend: s.weekend,
          end_day: s.endDay,
          times: s.endAfter,
          next: upcoming(s, data.today, s.chargedDay)[0] ?? null,
          category: s.category,
        })),
        // A past month the user still has to close (in Finances) before
        // anything can be added to this month; null = none.
        month_to_close: data.openMonth,
        // Due recurring money the user hasn't accepted yet (not counted).
        to_accept: data.pending.map((p) => ({
          kind: p.kind,
          amount: p.cents / 100,
          currency: p.currency,
          title: p.title,
          day: p.day,
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
    case 'update_recurring': {
      const parsed = updateSubArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const row = (await getItem('subscriptions', a.id)) as
        (FinanceSubscription & Record<string, unknown>) | null
      if (!row) return { error: 'Nothing recurring with that id' }
      const k = a.kind ?? row.kind
      const every = a.every ?? row.every
      const input = subscriptionInput.safeParse({
        kind: k,
        name: a.name ?? row.name,
        cents: a.amount === undefined ? row.cents : toCents(a.amount),
        currency: a.currency ?? row.currency,
        category: fitCategory(
          k,
          a.category ??
            (k === row.kind
              ? row.category
              : k === 'income'
                ? 'salary'
                : 'subscriptions'),
        ),
        every,
        interval: a.interval ?? row.interval,
        startDay: a.start_day ?? row.startDay,
        patterns: every === 'month' ? (a.days ?? row.patterns) : [],
        weekend: a.weekend === undefined ? row.weekend : a.weekend,
        endDay: a.end_day === undefined ? row.endDay : a.end_day,
        endAfter: a.times === undefined ? row.endAfter : a.times,
      })
      if (!input.success) return { error: input.error.issues[0].message }
      await editSubscription(row.id, input.data)
      const summary = {
        app: 'subscriptions' as const,
        target: 'item' as const,
        id: row.id,
        label: input.data.name,
      }
      await recordUpdate(ctx.runId, summary, row)
      return changed(ctx, {
        ...summary,
        op: 'update',
        detail: `${input.data.kind === 'income' ? '+' : ''}${formatMoney(input.data.cents, input.data.currency)} · ${describeSchedule(input.data)}`,
      })
    }
    case 'set_budget': {
      const parsed = budgetArgs.safeParse(args)
      if (!parsed.success) return bad
      const { category: key, amount: euros } = parsed.data
      if (!categoriesFor('expense').some((c) => c.key === key)) {
        return { error: 'Budgets are for expense categories' }
      }
      const data = await loadFinances()
      const before = data.budgets.find((b) => b.category === key)?.cents ?? null
      const cents = euros > 0 ? toCents(euros) : null
      if (before === cents) return { ok: true, unchanged: true }
      await setBudget(key, cents)
      const label = category(key).label
      const op =
        cents === null ? 'delete' : before === null ? 'create' : 'update'
      await recordBudget(ctx.runId, op, label, { category: key, cents: before })
      return changed(ctx, {
        app: 'budgets',
        target: 'item',
        op,
        id: 0,
        label,
        detail: cents === null ? 'removed' : `${formatMoney(cents)} a month`,
      })
    }
    case 'delete_money_entry':
    case 'delete_recurring': {
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
    case 'add_recurring': {
      const parsed = subArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const every = a.every ?? 'month'
      const input = subscriptionInput.safeParse({
        kind: a.kind,
        name: a.name,
        cents: toCents(a.amount),
        currency: a.currency ?? DEFAULT_CURRENCY,
        category: fitCategory(
          a.kind,
          a.category ?? (a.kind === 'income' ? 'salary' : 'subscriptions'),
        ),
        every,
        interval: a.interval ?? 1,
        startDay: a.start_day ?? today(ctx.timeZone),
        patterns: every === 'month' ? (a.days ?? []) : [],
        weekend: a.weekend ?? null,
        endDay: a.end_day ?? null,
        endAfter: a.times ?? null,
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
        detail: `${input.data.kind === 'income' ? '+' : ''}${formatMoney(input.data.cents, input.data.currency)} · ${describeSchedule(input.data)}`,
      })
    }
  }
  return undefined
}
