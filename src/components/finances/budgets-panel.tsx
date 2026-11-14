import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { toast } from '@/components/ui/toast'
import type { FinanceBudget, FinanceEntry } from '@/db/schema'
import { BUDGET_WARN, budgetLines } from '@/lib/finances/budgets'
import type { BudgetLine } from '@/lib/finances/budgets'
import { EXPENSE_CATEGORIES } from '@/lib/finances/categories'
import type { CategoryKey } from '@/lib/finances/categories'
import {
  centsToInput,
  formatMoney,
  monthLabel,
  parseAmount,
} from '@/lib/finances/money'
import { cn } from '@/lib/utils'
import { financesQueryOptions, saveBudget } from '@/server/finances.functions'

/**
 * The Budgets tab: this month against each budget (a bar, what's left and
 * where the month is heading at this pace; warning colour from 80%, red
 * when over, the same points the phone gets a notification at), then the
 * budgets themselves: optional monthly amounts per category (euros), saved
 * when a field is left; empty = none.
 */
export function BudgetsPanel({
  budgets,
  entries,
  month,
  today,
}: {
  budgets: Array<FinanceBudget>
  entries: Array<FinanceEntry>
  /** The current month (`YYYY-MM`). */
  month: string
  today: string
}) {
  const lines = budgetLines(budgets, entries, month, today)
  const total = lines.reduce((n, l) => n + l.budget, 0)
  const spent = lines.reduce((n, l) => n + l.spent, 0)
  return (
    <section className="flex flex-col gap-6">
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Set the most you want to spend a month on a category below. Its bar
          shows up here, and with phone reminders on you get a notification when
          it's nearly used up and when it's over.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium">{monthLabel(month)}</h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatMoney(spent)} of {formatMoney(total)} budgeted
            </span>
          </div>
          <ul className="flex flex-col gap-4">
            {lines.map((line) => (
              <BudgetRow key={line.category} line={line} />
            ))}
          </ul>
        </div>
      )}
      <Separator />
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Monthly budgets
        </h2>
        <BudgetFields budgets={budgets} />
      </div>
    </section>
  )
}

function BudgetRow({ line }: { line: BudgetLine }) {
  const over = line.left < 0
  const warn = !over && line.ratio >= BUDGET_WARN
  const heading = line.projected !== null && line.projected > line.budget
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: line.color }}
        />
        <span className="flex-1 truncate">{line.label}</span>
        <span className="tabular-nums">
          {formatMoney(line.spent)}
          <span className="text-muted-foreground">
            {' '}
            / {formatMoney(line.budget)}
          </span>
        </span>
      </div>
      <Progress
        value={Math.min(100, Math.round(line.ratio * 100))}
        aria-label={`${line.label}: ${Math.round(line.ratio * 100)}% of the budget`}
        className={cn(
          over && '[&_[data-slot=progress-indicator]]:bg-destructive',
          warn && '[&_[data-slot=progress-indicator]]:bg-warning',
        )}
      />
      <p
        className={cn(
          'text-xs text-muted-foreground',
          over && 'text-destructive',
        )}
      >
        {over
          ? `${formatMoney(-line.left)} over`
          : `${formatMoney(line.left)} left`}
        {line.projected !== null && !over && (
          <span className={cn(heading && 'text-warning')}>
            {' '}
            · on pace for {formatMoney(line.projected)}
          </span>
        )}
      </p>
    </li>
  )
}

function BudgetFields({ budgets }: { budgets: Array<FinanceBudget> }) {
  const queryClient = useQueryClient()
  const saved = new Map(budgets.map((b) => [b.category, b.cents]))
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      EXPENSE_CATEGORIES.map((c) => {
        const cents = saved.get(c.key)
        return [c.key, cents === undefined ? '' : centsToInput(cents)]
      }),
    ),
  )

  const save = useMutation({
    mutationFn: (input: { category: CategoryKey; cents: number | null }) =>
      saveBudget({ data: input }),
    onSuccess: () => queryClient.invalidateQueries(financesQueryOptions),
    onError: (error) =>
      toast.add({
        title: "Couldn't save the budget",
        description: error.message,
        type: 'error',
      }),
  })

  const commit = (key: CategoryKey) => {
    const text = values[key].trim()
    const cents = text ? parseAmount(text) : null
    if (text && cents === null) return
    if (cents === (saved.get(key) ?? null)) return
    save.mutate({ category: key, cents })
  }

  return (
    <FieldGroup className="gap-3">
      {EXPENSE_CATEGORIES.map((c) => (
        <Field key={c.key} orientation="horizontal">
          <FieldLabel htmlFor={`budget-${c.key}`} className="flex-1">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: c.color }}
            />
            {c.label}
          </FieldLabel>
          <InputGroup className="w-32">
            <InputGroupAddon>
              <InputGroupText>€</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id={`budget-${c.key}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="—"
              value={values[c.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [c.key]: e.target.value }))
              }
              onBlur={() => commit(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(c.key)
              }}
            />
          </InputGroup>
        </Field>
      ))}
    </FieldGroup>
  )
}
