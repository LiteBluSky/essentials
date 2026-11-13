import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FinanceSubscription } from '@/db/schema'
import { category } from '@/lib/finances/categories'
import type { CategoryKey } from '@/lib/finances/categories'
import {
  DEFAULT_CURRENCY,
  centsToInput,
  formatMoney,
  parseAmount,
} from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'
import { subscriptionInput } from '@/lib/finances/schemas'
import { monthlyCost, nextCharge } from '@/lib/finances/summary'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import {
  createSubscription,
  deleteSubscription,
  financesQueryOptions,
  updateSubscription,
} from '@/server/finances.functions'
import { CategorySelect, CurrencySelect, DayPicker, parseDay } from './pickers'

/**
 * Subscriptions: charged automatically (an expense on their day, every
 * month or year), so the month's money always counts them. Click one to
 * edit it; deleting stops it (past charges stay).
 */
export function SubscriptionsDialog({
  open,
  onOpenChange,
  subscriptions,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscriptions: Array<FinanceSubscription>
  today: string
}) {
  // null = adding a new one.
  const [editing, setEditing] = useState<FinanceSubscription | null>(null)
  const monthly = subscriptions
    .filter((s) => s.currency === DEFAULT_CURRENCY)
    .reduce((sum, s) => sum + monthlyCost(s), 0)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setEditing(null)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subscriptions</DialogTitle>
          <DialogDescription>
            Charged automatically on their day.
            {monthly > 0 && ` About ${formatMoney(monthly)} a month.`}
          </DialogDescription>
        </DialogHeader>
        {subscriptions.length === 0 ? (
          <Empty className="p-4">
            <EmptyHeader>
              <EmptyTitle>No subscriptions yet</EmptyTitle>
              <EmptyDescription>
                Add the ones you pay for (streaming, gym, phone…) below.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {subscriptions.map((s) => {
              const next = nextCharge(s, today)
              return (
                <li key={s.id}>
                  <Button
                    variant={editing?.id === s.id ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start gap-3 py-2 font-normal"
                    onClick={() => setEditing(s)}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: category(s.category).color }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col items-start">
                      <span className="max-w-full truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {next
                          ? `Next ${format(parseDay(next), 'EEE d MMM')}`
                          : ''}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(s.cents, s.currency)}
                      <span className="text-muted-foreground">
                        /{s.every === 'year' ? 'yr' : 'mo'}
                      </span>
                    </span>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <Separator />
        <SubscriptionForm
          key={editing?.id ?? 'new'}
          subscription={editing}
          today={today}
          onDone={() => setEditing(null)}
        />
      </DialogContent>
    </Dialog>
  )
}

function SubscriptionForm({
  subscription,
  today,
  onDone,
}: {
  subscription: FinanceSubscription | null
  today: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries(financesQueryOptions)

  const save = useMutation({
    mutationFn: async (
      value: Parameters<typeof createSubscription>[0]['data'],
    ) => {
      if (subscription) {
        await updateSubscription({ data: { id: subscription.id, ...value } })
      } else {
        await createSubscription({ data: value })
      }
    },
    onSuccess: async () => {
      await refresh()
      form.reset()
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save",
        description: error.message,
        type: 'error',
      }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteSubscription({ data: { id } }),
    onSuccess: async () => {
      await refresh()
      onDone()
      toast.add({ title: 'Subscription stopped', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      name: subscription?.name ?? '',
      amount: subscription ? centsToInput(subscription.cents) : '',
      currency: (subscription?.currency ?? DEFAULT_CURRENCY) as Currency,
      category: (subscription?.category ?? 'subscriptions') as CategoryKey,
      every: subscription?.every ?? 'month',
      startDay: subscription?.startDay ?? today,
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = subscriptionInput.safeParse({
          ...value,
          cents: parseAmount(value.amount) ?? 0,
        })
        if (result.success) return undefined
        return {
          fields: Object.fromEntries(
            result.error.issues.map((i) => [
              i.path[0] === 'cents' ? 'amount' : String(i.path[0]),
              i.message,
            ]),
          ),
        }
      },
    },
    onSubmit: ({ value: { amount, ...value } }) =>
      save.mutateAsync({ ...value, cents: parseAmount(amount) ?? 0 }),
  })

  const errorsOf = (errors: Array<unknown>) =>
    errors.map((m) => ({ message: String(m) }))

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      onKeyDownCapture={submitOnModEnter(() => void form.handleSubmit())}
      className="flex flex-col gap-4"
    >
      <h3 className="text-sm font-medium">
        {subscription ? `Edit “${subscription.name}”` : 'Add a subscription'}
      </h3>
      <FieldGroup>
        <div className="grid grid-cols-[1fr_7rem_auto] gap-3">
          <form.Field
            name="name"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="sub-name">Name</FieldLabel>
                  <Input
                    id="sub-name"
                    autoComplete="off"
                    placeholder="Netflix"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError errors={errorsOf(field.state.meta.errors)} />
                  )}
                </Field>
              )
            }}
          />
          <form.Field
            name="amount"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="sub-amount">Amount</FieldLabel>
                  <Input
                    id="sub-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="12.99"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError errors={errorsOf(field.state.meta.errors)} />
                  )}
                </Field>
              )
            }}
          />
          <form.Field
            name="currency"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor="sub-currency">Currency</FieldLabel>
                <CurrencySelect
                  id="sub-currency"
                  value={field.state.value}
                  onChange={field.handleChange}
                  className="w-24"
                />
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <form.Field
            name="every"
            children={(field) => (
              <Field>
                <FieldLabel id="sub-every">Every</FieldLabel>
                <ToggleGroup
                  aria-labelledby="sub-every"
                  variant="outline"
                  value={[field.state.value]}
                  onValueChange={(value: Array<string>) => {
                    const next = value.at(-1)
                    if (next) field.handleChange(next as 'month' | 'year')
                  }}
                >
                  <ToggleGroupItem value="month">Month</ToggleGroupItem>
                  <ToggleGroupItem value="year">Year</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
          />
          <form.Field
            name="startDay"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor="sub-start">
                  {subscription ? 'Charged from' : 'Next charge'}
                </FieldLabel>
                <DayPicker
                  id="sub-start"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              </Field>
            )}
          />
        </div>
        <form.Field
          name="category"
          children={(field) => (
            <Field>
              <FieldLabel htmlFor="sub-category">Category</FieldLabel>
              <CategorySelect
                id="sub-category"
                kind="expense"
                value={field.state.value}
                onChange={field.handleChange}
                className="w-full"
              />
            </Field>
          )}
        />
      </FieldGroup>
      <div className="flex justify-between gap-2">
        {subscription ? (
          <Button
            type="button"
            variant="outline"
            disabled={remove.isPending}
            onClick={() => remove.mutate(subscription.id)}
          >
            <Trash2Icon data-icon="inline-start" />
            Stop it
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {subscription && (
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
          )}
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  !subscription && <PlusIcon data-icon="inline-start" />
                )}
                {subscription ? 'Save' : 'Add'}
              </Button>
            )}
          />
        </div>
      </div>
    </form>
  )
}
