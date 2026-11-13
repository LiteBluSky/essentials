import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { toast } from '@/components/ui/toast'
import type { FinanceBudget } from '@/db/schema'
import { EXPENSE_CATEGORIES } from '@/lib/finances/categories'
import type { CategoryKey } from '@/lib/finances/categories'
import { centsToInput, parseAmount } from '@/lib/finances/money'
import { financesQueryOptions, saveBudget } from '@/server/finances.functions'

/**
 * Optional monthly budgets per category (euros). Saved when a field is
 * left; an empty field means no budget. Shown next to the month's
 * spending (red when over).
 */
export function BudgetsDialog({
  open,
  onOpenChange,
  budgets,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgets: Array<FinanceBudget>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Budgets</DialogTitle>
          <DialogDescription>
            Optional: the most you want to spend a month on each. Leave empty
            for none.
          </DialogDescription>
        </DialogHeader>
        {open && <BudgetFields budgets={budgets} />}
      </DialogContent>
    </Dialog>
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
