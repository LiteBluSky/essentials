import { format } from 'date-fns'
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  financeBudgets,
  financeEntries,
  financeMonths,
  financeSubscriptions,
} from '@/db/schema'
import {
  CATEGORIES,
  UNCATEGORIZED,
  categoriesFor,
  category,
} from '@/lib/finances/categories'
import {
  formatMoney,
  monthLabel,
  monthOf,
  addMonth,
} from '@/lib/finances/money'
import type { EntryInput, SubscriptionInput } from '@/lib/finances/schemas'
import { monthTotals } from '@/lib/finances/summary'
import {
  describeSchedule,
  dueDays,
  monthlyAmount,
} from '@/lib/finances/schedule'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { logRequest } from './assistant-log.server'
import { saveTurn } from './chat.server'
import { callModel, llmConfig } from './llm.server'
import { WEB_SEARCH_PROMPT } from './prompts.server'

// Server-only: the Finances app. Only import from *.functions.ts (and the
// assistant's tools). "Today" is the server's local day (like the strip
// reminders; Docker: set TZ). Whenever the data loads, recurring expenses
// and income due by today are added and every month before this one is folded into its
// report (per category and currency) and its entries deleted.

export function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Adds an entry for each day a recurring expense / income fell on by
 * `day`. */
async function chargeSubscriptions(day: string) {
  const subs = await db.select().from(financeSubscriptions)
  for (const sub of subs) {
    const due = dueDays(sub, sub.chargedDay, day)
    if (due.length === 0) continue
    await db.transaction(async (tx) => {
      await tx.insert(financeEntries).values(
        due.map((charge) => ({
          kind: sub.kind,
          cents: sub.cents,
          currency: sub.currency,
          title: sub.name,
          category: sub.category,
          day: charge,
          subscriptionId: sub.id,
        })),
      )
      await tx
        .update(financeSubscriptions)
        .set({ chargedDay: due[due.length - 1] })
        .where(eq(financeSubscriptions.id, sub.id))
    })
  }
}

/** Folds the entries of every month before `month` into the reports and
 * deletes them. */
async function rollUp(month: string) {
  const first = `${month}-01`
  const old = await db
    .select()
    .from(financeEntries)
    .where(lt(financeEntries.day, first))
  if (old.length === 0) return
  const lines = new Map<
    string,
    {
      month: string
      kind: 'expense' | 'income'
      category: string
      currency: string
      cents: number
      count: number
    }
  >()
  for (const e of old) {
    const m = monthOf(e.day)
    const key = `${m}|${e.kind}|${e.category}|${e.currency}`
    const line = lines.get(key)
    if (line) {
      line.cents += e.cents
      line.count++
    } else {
      lines.set(key, {
        month: m,
        kind: e.kind,
        category: e.category,
        currency: e.currency,
        cents: e.cents,
        count: 1,
      })
    }
  }
  await db.transaction(async (tx) => {
    for (const line of lines.values()) {
      await tx
        .insert(financeMonths)
        .values(line)
        .onConflictDoUpdate({
          target: [
            financeMonths.month,
            financeMonths.kind,
            financeMonths.category,
            financeMonths.currency,
          ],
          set: {
            cents: sql`${financeMonths.cents} + ${line.cents}`,
            count: sql`${financeMonths.count} + ${line.count}`,
          },
        })
    }
    await tx.delete(financeEntries).where(lt(financeEntries.day, first))
  })
}

/** Charges what's due, closes past months, then loads everything: this
 * month's (and later) entries, every past month's report, the
 * subscriptions and the budgets. */
export async function loadFinances() {
  const day = today()
  const month = monthOf(day)
  await chargeSubscriptions(day)
  await rollUp(month)
  const [entries, reports, subscriptions, budgets] = await Promise.all([
    db
      .select()
      .from(financeEntries)
      .where(gte(financeEntries.day, `${month}-01`))
      .orderBy(desc(financeEntries.day), desc(financeEntries.id)),
    db
      .select()
      .from(financeMonths)
      .orderBy(desc(financeMonths.month), desc(financeMonths.cents)),
    db
      .select()
      .from(financeSubscriptions)
      .orderBy(
        asc(sql`${financeSubscriptions.name} collate nocase`),
        asc(financeSubscriptions.id),
      ),
    db.select().from(financeBudgets),
  ])
  return { today: day, month, entries, reports, subscriptions, budgets }
}

export async function insertEntry(input: EntryInput) {
  const [row] = await db
    .insert(financeEntries)
    .values(input)
    .returning({ id: financeEntries.id })
  return row
}

export async function editEntry(id: number, input: EntryInput) {
  await db.update(financeEntries).set(input).where(eq(financeEntries.id, id))
}

export async function removeEntry(id: number) {
  await db.delete(financeEntries).where(eq(financeEntries.id, id))
}

export async function insertSubscription(input: SubscriptionInput) {
  const [row] = await db
    .insert(financeSubscriptions)
    .values(input)
    .returning({ id: financeSubscriptions.id })
  return row
}

/** Changing the schedule re-plans what's still to come (what was already
 * added stays). Switching expense ⇄ income also fixes the entries it
 * already added this month (past months only keep totals). */
export async function editSubscription(id: number, input: SubscriptionInput) {
  await db.transaction(async (tx) => {
    const before = (
      await tx
        .select({ kind: financeSubscriptions.kind })
        .from(financeSubscriptions)
        .where(eq(financeSubscriptions.id, id))
    ).at(0)
    await tx
      .update(financeSubscriptions)
      .set(input)
      .where(eq(financeSubscriptions.id, id))
    if (before && before.kind !== input.kind) {
      await tx
        .update(financeEntries)
        .set({ kind: input.kind, category: input.category })
        .where(eq(financeEntries.subscriptionId, id))
    }
  })
}

/** Stops it; what it already charged stays. */
export async function removeSubscription(id: number) {
  await db.delete(financeSubscriptions).where(eq(financeSubscriptions.id, id))
}

export async function setBudget(categoryKey: string, cents: number | null) {
  if (cents === null) {
    await db
      .delete(financeBudgets)
      .where(eq(financeBudgets.category, categoryKey))
    return
  }
  await db
    .insert(financeBudgets)
    .values({ category: categoryKey, cents })
    .onConflictDoUpdate({ target: financeBudgets.category, set: { cents } })
}

// ---- AI (only when asked) ---------------------------------------------------

async function plainCall(
  system: string,
  text: string,
  logText: string,
  webSearch = false,
) {
  const config = await llmConfig()
  if (!config) throw new Error('Add an API key in Settings first')
  const started = Date.now()
  try {
    const reply = await callModel(config, {
      system,
      turns: [{ role: 'user', text }],
      tools: [],
      webSearch,
    })
    await logRequest({
      text: logText,
      source: 'finances',
      provider: reply.provider,
      model: reply.model,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      costUsd: reply.costUsd,
      ok: true,
      result: reply.text.slice(0, 300),
      durationMs: Date.now() - started,
    })
    return reply
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logRequest({
      text: logText,
      source: 'finances',
      provider: config.provider,
      model: config.model,
      ok: false,
      result: message,
      durationMs: Date.now() - started,
    })
    throw error
  }
}

/** One AI request: picks a category for each uncategorized entry (with a
 * description) among `ids`; returns how many got one. */
export async function categorizeEntries(ids: Array<number>) {
  const rows = (
    await db
      .select()
      .from(financeEntries)
      .where(
        and(
          inArray(financeEntries.id, ids),
          eq(financeEntries.category, UNCATEGORIZED),
        ),
      )
  ).filter((e) => e.title.trim())
  if (rows.length === 0) return 0
  const list = (kind: 'expense' | 'income') =>
    categoriesFor(kind)
      .map((c) => `${c.key} (${c.label})`)
      .join(', ')
  const reply = await plainCall(
    [
      'You sort personal money entries into categories.',
      `Expense categories: ${list('expense')}.`,
      `Income categories: ${list('income')}.`,
      `Use "${UNCATEGORIZED}" only when the description gives no clue.`,
      'Answer with only a JSON object mapping each id to a category key, e.g. {"12": "groceries"}. No other text.',
    ].join('\n'),
    rows
      .map(
        (e) =>
          `${e.id}: ${e.kind}, ${formatMoney(e.cents, e.currency)}, "${e.title}"`,
      )
      .join('\n'),
    `Categorize: ${rows.map((e) => e.title).join(', ')}`.slice(0, 2000),
  )
  const json = /\{[\s\S]*\}/.exec(reply.text)?.[0]
  if (!json) return 0
  let picked: Record<string, unknown>
  try {
    picked = JSON.parse(json) as Record<string, unknown>
  } catch {
    return 0
  }
  let done = 0
  for (const e of rows) {
    const key = picked[String(e.id)]
    if (typeof key !== 'string' || key === UNCATEGORIZED) continue
    if (!categoriesFor(e.kind).some((c) => c.key === key)) continue
    await db
      .update(financeEntries)
      .set({ category: key })
      .where(eq(financeEntries.id, e.id))
    done++
  }
  return done
}

/** A month in words, for the advice prompt. */
function describeMonth(
  month: string,
  data: Awaited<ReturnType<typeof loadFinances>>,
) {
  const totals = monthTotals(month, data.entries, data.reports)
  if (totals.length === 0) return `${monthLabel(month)}: nothing recorded.`
  return totals
    .map((t) => {
      const money = (c: number) => formatMoney(c, t.currency)
      const lines = (ls: typeof t.expenses) =>
        ls
          .map((l) => `${category(l.category).label} ${money(l.cents)}`)
          .join(', ')
      return [
        `${monthLabel(month)} (${t.currency}): carried over from before ${money(t.carried)}, income ${money(t.income)}, spent ${money(t.spent)}, left at the end ${money(t.carried + t.income - t.spent)}.`,
        t.expenses.length ? `  Spent on: ${lines(t.expenses)}.` : '',
        t.incomes.length ? `  Income from: ${lines(t.incomes)}.` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

/** One AI request: plain-language advice on the user's money (and their
 * question, if any), saved as a Chat conversation. */
export async function getAdvice(
  question: string,
  month: string,
  webSearch = false,
) {
  const data = await loadFinances()
  const months = [0, 1, 2, 3, 4, 5].map((n) => addMonth(month, -n))
  const subs = data.subscriptions
  const facts = [
    `Today is ${data.today}. The month asked about is ${monthLabel(month)}${month === data.month ? ' (still going on)' : ''}.`,
    '',
    ...months.map((m) => describeMonth(m, data)),
    '',
    subs.length
      ? `Recurring (added automatically): ${subs
          .map(
            (s) =>
              `${s.kind === 'income' ? 'income' : 'expense'} ${s.name} ${formatMoney(s.cents, s.currency)}, ${describeSchedule(s)} (${category(s.category).label})`,
          )
          .join('; ')}. In euros, about ${formatMoney(
          subs
            .filter((s) => s.currency === 'EUR' && s.kind === 'expense')
            .reduce((sum, s) => sum + monthlyAmount(s), 0),
        )} a month out and ${formatMoney(
          subs
            .filter((s) => s.currency === 'EUR' && s.kind === 'income')
            .reduce((sum, s) => sum + monthlyAmount(s), 0),
        )} in.`
      : 'Nothing recurring.',
    data.budgets.length
      ? `Monthly budgets: ${data.budgets
          .map((b) => `${category(b.category).label} ${formatMoney(b.cents)}`)
          .join(', ')}.`
      : 'No budgets set.',
    month === data.month && data.entries.length
      ? `This month's entries: ${data.entries
          .slice(0, 150)
          .map(
            (e) =>
              `${e.day} ${e.kind === 'income' ? '+' : '-'}${formatMoney(e.cents, e.currency)} ${e.title || '(no description)'} [${category(e.category).label}]`,
          )
          .join('; ')}.`
      : '',
  ].join('\n')

  const system = [
    `You are ${ASSISTANT_NAME}, a friendly money coach inside the user's personal app. The user knows nothing about personal finance: explain simply, no jargon (or explain it in a few words), no lecturing.`,
    'Base everything on their numbers below. Give: a short recap of the month (where the money went, what was left), what is going well, the 2–3 most useful things to improve, each with a concrete step and how much it could save, and a simple saving plan (e.g. pay yourself first, an emergency fund of 3–6 months of spending, the 50/30/20 split) fitted to their income. If they ask about buying or saving for something, say whether it fits and how long it would take to save for it.',
    'What is left at the end of a month carries over into the next (an overspend too). Mention recurring expenses (subscriptions) worth checking. Note that past months only keep totals per category. Amounts in different currencies are never converted. Never invent numbers; if there is little data, say what to track to get better advice.',
    "Answer briefly in the user's language, in markdown, with short headings or bullets.",
    `Category names: ${CATEGORIES.map((c) => c.label).join(', ')}.`,
  ].join('\n')

  const ask =
    question || `How am I doing in ${monthLabel(month)}? How can I save more?`
  const reply = await plainCall(
    webSearch ? `${system}\n${WEB_SEARCH_PROMPT}` : system,
    `${facts}\n\nMy question: ${ask}`,
    ask,
    webSearch,
  )
  const answer = reply.text.trim() || "I couldn't come up with anything."
  // Saved as a chat, so it can be read again and carried on.
  let conversationId: number | null = null
  try {
    const { message } = await saveTurn(null, ask, {
      answer,
      result: { created: [], found: [], changed: [] },
      usage: null,
      error: null,
    })
    conversationId = message.conversationId
  } catch (error) {
    console.error("Couldn't save the advice to Chat:", error)
  }
  return { answer, conversationId }
}
