// The Finances app's categories: a fixed, short list (no setup needed),
// stored by key. Each has a colour for the circle chart (spelled out, so the
// chart and the legend dots match in both themes).

export const UNCATEGORIZED = 'uncategorized'

/** Money put into a savings account (an expense: it leaves the wallet) and
 * taken back out of one (income). Only the Savings tab / Jarvis's savings
 * tools make these. */
export const TO_SAVINGS = 'savings'
export const FROM_SAVINGS = 'from_savings'
export const SAVINGS_CATEGORIES: ReadonlyArray<string> = [
  TO_SAVINGS,
  FROM_SAVINGS,
]

export const EXPENSE_CATEGORIES = [
  { key: 'housing', label: 'Housing', color: 'oklch(0.62 0.19 260)' },
  { key: 'bills', label: 'Bills & utilities', color: 'oklch(0.7 0.15 230)' },
  { key: 'groceries', label: 'Groceries', color: 'oklch(0.68 0.17 150)' },
  { key: 'eating_out', label: 'Eating out', color: 'oklch(0.72 0.17 60)' },
  { key: 'transport', label: 'Transport', color: 'oklch(0.65 0.12 200)' },
  { key: 'subscriptions', label: 'Subscriptions', color: 'oklch(0.6 0.2 300)' },
  { key: 'shopping', label: 'Shopping', color: 'oklch(0.66 0.2 350)' },
  { key: 'health', label: 'Health', color: 'oklch(0.64 0.21 25)' },
  { key: 'fun', label: 'Entertainment', color: 'oklch(0.8 0.16 90)' },
  { key: 'travel', label: 'Travel', color: 'oklch(0.6 0.13 180)' },
  { key: 'education', label: 'Education', color: 'oklch(0.55 0.15 280)' },
  { key: 'gifts', label: 'Gifts', color: 'oklch(0.7 0.16 0)' },
  { key: 'other', label: 'Other', color: 'oklch(0.6 0.03 260)' },
  { key: TO_SAVINGS, label: 'Savings', color: 'oklch(0.58 0.14 165)' },
] as const

export const INCOME_CATEGORIES = [
  { key: 'salary', label: 'Salary', color: 'oklch(0.62 0.17 150)' },
  { key: 'paid_back', label: 'Paid back', color: 'oklch(0.7 0.14 200)' },
  { key: 'extra', label: 'Other income', color: 'oklch(0.75 0.15 90)' },
  { key: FROM_SAVINGS, label: 'From savings', color: 'oklch(0.7 0.11 165)' },
] as const

const NONE = {
  key: UNCATEGORIZED,
  label: 'Uncategorized',
  color: 'oklch(0.75 0 0)',
} as const

export const CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  NONE,
] as const

export type CategoryKey = (typeof CATEGORIES)[number]['key']

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [
  CategoryKey,
  ...Array<CategoryKey>,
]

export type EntryKind = 'expense' | 'income'

/** The categories an entry of this kind can have (uncategorized last). */
export function categoriesFor(kind: EntryKind) {
  return [
    ...(kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES),
    NONE,
  ]
}

/** The categories to pick from by hand: not the savings ones (the Savings
 * tab makes those), unless the entry already has one. */
export function pickableCategories(kind: EntryKind, current?: string) {
  return categoriesFor(kind).filter(
    (c) => !SAVINGS_CATEGORIES.includes(c.key) || c.key === current,
  )
}

/** Expense categories that can have a monthly budget (not Savings). */
export const BUDGET_CATEGORIES = EXPENSE_CATEGORIES.filter(
  (c) => c.key !== TO_SAVINGS,
)

export function category(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? NONE
}
