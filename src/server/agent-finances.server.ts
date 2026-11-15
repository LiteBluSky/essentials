import { z } from 'zod'

import type { FinanceSaving, FinanceSubscription } from '@/db/schema'
import type { ChangeSummary } from '@/lib/assistant'
import {
  CATEGORY_KEYS,
  SAVINGS_CATEGORIES,
  UNCATEGORIZED,
  categoriesFor,
  category,
} from '@/lib/finances/categories'
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatMoney,
  monthLabel,
} from '@/lib/finances/money'
import {
  day,
  entryInput,
  pattern,
  savingInput,
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
  recordMonthClose,
  recordUpdate,
} from './changes.server'
import {
  editEntry,
  editSaving,
  editSubscription,
  insertEntry,
  insertSaving,
  insertSubscription,
  loadFinances,
  moveSaving,
  removeEntry,
  removeSaving,
  removeSubscription,
  setBudget,
} from './finances.server'
import { acceptPending, skipPending } from './finances-due.server'
import { closeMonth } from './finances-months.server'
import type { ToolDef } from './llm.server'

// Server-only: the assistant's Finances tools (Tell me and Chat): all of
// Finances, like the page. Every change is recorded under the run (Undo):
// entries as `finances` items, recurring expenses / income as
// `subscriptions`, savings accounts as `savings`, charges waiting to be
// accepted as `pending`, a closed month as `months`.

/** The categories an entry can be given by hand: not the savings ones
 * (only put_in_savings / take_from_savings make those). */
const plain = (kind: 'expense' | 'income') =>
  categoriesFor(kind)
    .map((c) => c.key)
    .filter((key) => !SAVINGS_CATEGORIES.includes(key))

const CATEGORY_PARAM = {
  type: 'string',
  enum: CATEGORY_KEYS.filter((key) => !SAVINGS_CATEGORIES.includes(key)),
  description: `Expenses: ${plain('expense').join(', ')}. Income: ${plain('income').join(', ')}. Pick the one that fits what it was; "${UNCATEGORIZED}" only if nothing is known.`,
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
      "The user's money for a month (YYYY-MM, default this month): totals per category and currency (left = carried over from earlier months + in − out), this month's entries with ids (saving_id = money moved into / out of that savings account), recurring expenses / income, what fell due and waits to be accepted (to_accept, with ids: not counted until accepted), savings accounts (balance, optional goal) and budgets. Closed months only keep totals (their entries are gone). Past months are closed by the user (or by you with close_month when they ask); until the oldest open one is closed (month_to_close) nothing can be added to this month, only to that month.",
    parameters: {
      type: 'object',
      properties: { month: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'update_money_entry',
    description:
      'Change an entry (an id from list_finances): give only what changes. One with a saving_id moved money into / out of that savings account: its balance follows.',
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
      'Delete an entry (an id from list_finances). Only when asked to. One with a saving_id moves its money back out of / into that savings account.',
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
        category: { type: 'string', enum: plain('expense') },
        amount: {
          type: 'number',
          description: 'Euros a month; 0 = no budget.',
        },
      },
      required: ['category', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_savings',
    description:
      'Create a savings account: a place in Finances where the user keeps money apart from their wallet ("Emergency fund", "Holidays", "New car" with a goal of 15000). A goal (an amount to reach) is optional. starting_balance = money already in it (not taken from the wallet); to move money from the wallet use put_in_savings.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        goal: { type: 'number', description: 'Optional amount to reach.' },
        starting_balance: { type: 'number' },
        currency: CURRENCY_PARAM,
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_savings',
    description:
      'Change a savings account (an id from list_finances): name, goal (0 removes it), currency, or correct its balance by hand (not taken from / given back to the wallet; to move money use put_in_savings / take_from_savings). Give only what changes.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        goal: { type: 'number' },
        balance: { type: 'number' },
        currency: CURRENCY_PARAM,
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_savings',
    description:
      'Delete a savings account (e.g. the thing was bought). What is in it stays counted as spent; to have it back in the wallet, take_from_savings first. Only when asked to.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'put_in_savings',
    description:
      'Move money from the wallet into a savings account ("put 200 in the car fund", "save 50 for holidays"). It counts as an expense that month (category Savings, in the account\'s currency), so it comes off what is left.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        amount: { type: 'number' },
        day: {
          type: 'string',
          description:
            'YYYY-MM-DD; default today (or the last day of the past month still to close).',
        },
      },
      required: ['id', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'take_from_savings',
    description:
      'Take money out of a savings account back into the wallet: counted as income that month (From savings). At most what is in it.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        amount: { type: 'number' },
        day: { type: 'string', description: 'YYYY-MM-DD; default today.' },
      },
      required: ['id', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'accept_due',
    description:
      'Accept recurring money that fell due (an id from to_accept in list_finances): it becomes an entry on its day. When the user says it was paid / received or asks to accept it.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'skip_due',
    description:
      'Skip recurring money that fell due (an id from to_accept): it did not happen, nothing is added. Only when asked to.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'close_month',
    description:
      'Close the oldest past month still open (month_to_close in list_finances): its entries are folded into totals per category and nothing more can be added to it; then the current month takes entries again. Refused while it has charges to accept or skip. Only when the user asks to close it.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
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
const addSavingArgs = z.object({
  name: z.string(),
  goal: z.number().min(0).optional(),
  starting_balance: z.number().min(0).optional(),
  currency: currency.optional(),
})
const updateSavingArgs = z.object({
  id,
  name: z.string().optional(),
  goal: z.number().min(0).optional(),
  balance: z.number().min(0).optional(),
  currency: currency.optional(),
})
const moveArgs = z.object({ id, amount, day: day.optional() })

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

/** A savings account's money, with its goal: "€350 of €1,000". */
function savingDetail(
  saving: Pick<FinanceSaving, 'cents' | 'savedCents' | 'currency'>,
) {
  const money = (cents: number) => formatMoney(cents, saving.currency)
  return saving.cents === null
    ? `${money(saving.savedCents)} in it`
    : `${money(saving.savedCents)} of ${money(saving.cents)}`
}

/** Records a savings account as it was before an entry linked to it
 * changed (its balance followed the entry; Undo puts both back). */
async function recordLinkedSaving(
  ctx: RunContext,
  before: Awaited<ReturnType<typeof getItem>>,
) {
  if (!before) return
  await recordUpdate(
    ctx.runId,
    {
      app: 'savings',
      target: 'item',
      id: before.id,
      label: String(before.name),
    },
    before,
  )
}

/** The savings account an entry is linked to, as it is now (null if none). */
async function linkedSaving(entry: Awaited<ReturnType<typeof getItem>>) {
  const savingId = entry?.savingId
  return typeof savingId === 'number' ? getItem('savings', savingId) : null
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
            saving_id: e.savingId,
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
          id: p.id,
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
        // Money kept apart: put in = an expense (Savings), taken out =
        // income (From savings). goal null = none.
        savings: data.savings.map((sv) => ({
          id: sv.id,
          name: sv.name,
          balance: sv.savedCents / 100,
          goal: sv.cents === null ? null : sv.cents / 100,
          currency: sv.currency,
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
      const savingBefore = await linkedSaving(before)
      await editEntry(row.id, input.data)
      await recordLinkedSaving(ctx, savingBefore)
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
    case 'delete_recurring':
    case 'delete_savings': {
      const parsed = z.object({ id }).safeParse(args)
      if (!parsed.success) return bad
      const itemId = parsed.data.id
      const app =
        name === 'delete_money_entry'
          ? ('finances' as const)
          : name === 'delete_recurring'
            ? ('subscriptions' as const)
            : ('savings' as const)
      // An entry that moved savings money moves it back: the account as it
      // was is kept for Undo.
      const savingBefore =
        app === 'finances'
          ? await linkedSaving(await getItem(app, itemId))
          : null
      const label = await deleteItemRecorded(ctx.runId, app, itemId, () =>
        app === 'finances'
          ? removeEntry(itemId)
          : app === 'subscriptions'
            ? removeSubscription(itemId)
            : removeSaving(itemId),
      ).catch(() => null)
      if (label === null) return { error: 'Nothing with that id' }
      await recordLinkedSaving(ctx, savingBefore)
      return changed(ctx, {
        app,
        target: 'item',
        op: 'delete',
        id: itemId,
        label,
      })
    }
    case 'add_savings': {
      const parsed = addSavingArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const input = savingInput.safeParse({
        name: a.name,
        cents: a.goal ? toCents(a.goal) : null,
        currency: a.currency ?? DEFAULT_CURRENCY,
        savedCents: toCents(a.starting_balance ?? 0),
      })
      if (!input.success) return { error: input.error.issues[0].message }
      const { id: savingId } = await insertSaving(input.data)
      const summary = {
        app: 'savings' as const,
        target: 'item' as const,
        id: savingId,
        label: input.data.name,
      }
      await recordCreate(ctx.runId, summary)
      return changed(ctx, {
        ...summary,
        op: 'create',
        detail: savingDetail(input.data),
      })
    }
    case 'update_savings': {
      const parsed = updateSavingArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const row = (await getItem('savings', a.id)) as
        (FinanceSaving & Record<string, unknown>) | null
      if (!row) return { error: 'No savings account with that id' }
      const input = savingInput.safeParse({
        name: a.name ?? row.name,
        cents:
          a.goal === undefined ? row.cents : a.goal ? toCents(a.goal) : null,
        currency: a.currency ?? row.currency,
        savedCents:
          a.balance === undefined ? row.savedCents : toCents(a.balance),
      })
      if (!input.success) return { error: input.error.issues[0].message }
      await editSaving(row.id, input.data)
      const summary = {
        app: 'savings' as const,
        target: 'item' as const,
        id: row.id,
        label: input.data.name,
      }
      await recordUpdate(ctx.runId, summary, row)
      return changed(ctx, {
        ...summary,
        op: 'update',
        detail: savingDetail(input.data),
      })
    }
    case 'put_in_savings':
    case 'take_from_savings': {
      const parsed = moveArgs.safeParse(args)
      if (!parsed.success) return bad
      const a = parsed.data
      const into = name === 'put_in_savings'
      let moved: Awaited<ReturnType<typeof moveSaving>>
      try {
        moved = await moveSaving(
          {
            id: a.id,
            cents: toCents(a.amount),
            direction: into ? 'in' : 'out',
          },
          a.day,
        )
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
      const summary = {
        app: 'savings' as const,
        target: 'item' as const,
        id: moved.saving.id,
        label: moved.saving.name,
      }
      // Undo (newest first): the entry goes, then the balance comes back.
      await recordUpdate(ctx.runId, summary, moved.before)
      await recordCreate(ctx.runId, {
        app: 'finances',
        target: 'item',
        id: moved.entryId,
        label: moved.saving.name,
      })
      const money = formatMoney(toCents(a.amount), moved.saving.currency)
      return {
        ...changed(ctx, {
          ...summary,
          op: 'update',
          detail: `${money} ${into ? 'put in' : 'taken out'} · ${savingDetail(moved.saving)}`,
        }),
        day: moved.day,
      }
    }
    case 'accept_due':
    case 'skip_due': {
      const parsed = z.object({ id }).safeParse(args)
      if (!parsed.success) return bad
      const pendingId = parsed.data.id
      const accept = name === 'accept_due'
      const row = await getItem('pending', pendingId)
      if (!row) return { error: 'Nothing waiting with that id' }
      // Set inside the delete (an object, so TS sees it may change).
      const accepted: { entryId: number | null } = { entryId: null }
      try {
        await deleteItemRecorded(ctx.runId, 'pending', pendingId, async () => {
          if (accept) accepted.entryId = await acceptPending(pendingId)
          else await skipPending(pendingId)
        })
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
      const label = String(row.title) || 'Recurring'
      const money = `${row.kind === 'income' ? '+' : '−'}${formatMoney(Number(row.cents), String(row.currency))}`
      if (accepted.entryId !== null) {
        const summary = {
          app: 'finances' as const,
          target: 'item' as const,
          id: accepted.entryId,
          label,
        }
        await recordCreate(ctx.runId, summary)
        return changed(ctx, {
          ...summary,
          op: 'create',
          detail: `accepted · ${money} on ${String(row.day)}`,
        })
      }
      return changed(ctx, {
        app: 'pending',
        target: 'item',
        op: 'delete',
        id: pendingId,
        label,
        detail: `skipped · ${money} on ${String(row.day)}`,
      })
    }
    case 'close_month': {
      let closed: Awaited<ReturnType<typeof closeMonth>>
      try {
        closed = await closeMonth()
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
      const label = monthLabel(closed.month)
      await recordMonthClose(ctx.runId, label, closed)
      return changed(ctx, {
        app: 'months',
        target: 'item',
        op: 'update',
        id: 0,
        label,
        detail: 'closed',
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
