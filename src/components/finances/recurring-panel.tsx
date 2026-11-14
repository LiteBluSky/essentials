import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addYears, format } from 'date-fns'
import { PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FinanceSubscription } from '@/db/schema'
import { categoriesFor, category } from '@/lib/finances/categories'
import type { CategoryKey, EntryKind } from '@/lib/finances/categories'
import {
  DEFAULT_CURRENCY,
  centsToInput,
  formatMoney,
  parseAmount,
} from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'
import { subscriptionInput } from '@/lib/finances/schemas'
import type { SubscriptionInput } from '@/lib/finances/schemas'
import {
  WEEKDAYS,
  describeSchedule,
  monthlyAmount,
  ordinal,
  upcoming,
} from '@/lib/finances/schedule'
import type { Every, Pattern } from '@/lib/finances/schedule'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import {
  createSubscription,
  deleteSubscription,
  financesQueryOptions,
  updateSubscription,
} from '@/server/finances.functions'
import { CategorySelect, CurrencySelect, DayPicker, parseDay } from './pickers'

/**
 * The Recurring tab. Recurring money ("subscriptions" in the code):
 * expenses (rent, Netflix…) and income (salary…): on each day of their
 * schedule one waits to be accepted, so the month's money always counts
 * them. Click one to edit it in the form below; deleting stops it (what it
 * already added stays).
 */
export function RecurringPanel({
  subscriptions,
  today,
}: {
  subscriptions: Array<FinanceSubscription>
  today: string
}) {
  // null = adding a new one.
  const [editing, setEditing] = useState<FinanceSubscription | null>(null)
  const monthly = (kind: EntryKind) =>
    subscriptions
      .filter((s) => s.currency === DEFAULT_CURRENCY && s.kind === kind)
      .reduce((sum, s) => sum + monthlyAmount(s), 0)
  const out = monthly('expense')
  const into = monthly('income')
  // Income first, then expenses; each by name (as loaded).
  const sorted = [...subscriptions].sort(
    (a, b) => (a.kind === 'income' ? 0 : 1) - (b.kind === 'income' ? 0 : 1),
  )
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Bills, subscriptions and income. On their day you get a notification
        (9:00) and accept each one under To accept.
        {into > 0 && ` About ${formatMoney(into)} in`}
        {into > 0 && out > 0 && ' and'}
        {out > 0 && `${into > 0 ? '' : ' About'} ${formatMoney(out)} out`}
        {(into > 0 || out > 0) && ' a month.'}
      </p>
      {subscriptions.length === 0 ? (
        <Empty className="p-4">
          <EmptyHeader>
            <EmptyTitle>Nothing recurring yet</EmptyTitle>
            <EmptyDescription>
              Add your salary, rent, subscriptions (streaming, gym, phone…)
              below.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col">
          {sorted.map((s) => {
            const next = upcoming(s, today, s.chargedDay)[0]
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
                    <span className="max-w-full truncate text-xs text-muted-foreground">
                      {describeSchedule(s)}
                      {next
                        ? ` · next ${format(parseDay(next), 'EEE d MMM')}`
                        : ' · ended'}
                    </span>
                  </span>
                  <span
                    className={
                      s.kind === 'income'
                        ? 'tabular-nums text-success'
                        : 'tabular-nums'
                    }
                  >
                    {formatMoney(s.cents, s.currency, {
                      signed: s.kind === 'income',
                    })}
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
    </section>
  )
}

const UNITS: Array<{ value: Every; label: string }> = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
]

const WEEKEND = [
  { value: 'keep', label: 'Keep the day' },
  { value: 'before', label: 'Move to the Friday before' },
  { value: 'after', label: 'Move to the Monday after' },
]

const ENDS = [
  { value: 'never', label: 'Never' },
  { value: 'day', label: 'On a day' },
  { value: 'times', label: 'After a number of times' },
]

/** "What" in a day-of-month row: a day number, a working day or a weekday. */
const WHAT = [
  { value: 'day', label: 'Day' },
  { value: 'workday', label: 'Working day' },
  // Monday first.
  ...[1, 2, 3, 4, 5, 6, 0].map((d) => ({
    value: String(d),
    label: WEEKDAYS[d],
  })),
]

function whatOf(p: Pattern) {
  return p.type === 'weekday' ? String(p.weekday) : p.type
}

function whichOf(p: Pattern) {
  return p.type === 'day' ? p.day : p.nth
}

function whichOptions(p: Pattern) {
  const max = p.type === 'day' ? 31 : 5
  return [
    ...Array.from({ length: max }, (_, i) => ({
      value: String(i + 1),
      label: ordinal(i + 1),
    })),
    { value: '-1', label: 'Last' },
  ]
}

function makePattern(what: string, which: number): Pattern {
  if (what === 'day') return { type: 'day', day: which }
  const nth = which > 5 ? 5 : which
  if (what === 'workday') return { type: 'workday', nth }
  return { type: 'weekday', weekday: Number(what), nth }
}

/** A plain `Select` over string options. */
function SimpleSelect({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id?: string
  label?: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => next !== null && onChange(next)}
    >
      <SelectTrigger id={id} className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

type FormValues = {
  kind: EntryKind
  name: string
  amount: string
  currency: Currency
  category: CategoryKey
  every: Every
  interval: string
  startDay: string
  patterns: Array<Pattern>
  weekend: string
  ends: string
  endDay: string
  endAfter: string
}

function toInput(v: FormValues) {
  return {
    kind: v.kind,
    name: v.name,
    cents: parseAmount(v.amount) ?? 0,
    currency: v.currency,
    category: v.category,
    every: v.every,
    interval: Number(v.interval) || 0,
    startDay: v.startDay,
    patterns: v.every === 'month' ? v.patterns : [],
    weekend: v.weekend === 'keep' ? null : (v.weekend as 'before' | 'after'),
    endDay: v.ends === 'day' ? v.endDay : null,
    endAfter: v.ends === 'times' ? Number(v.endAfter) || 0 : null,
  }
}

/** Form field names for the schema's paths. */
const FIELD_OF: Record<string, string> = { cents: 'amount' }

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
    mutationFn: async (value: SubscriptionInput) => {
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
      toast.add({ title: 'Stopped', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })

  const s = subscription
  const defaultValues: FormValues = {
    kind: s?.kind ?? 'expense',
    name: s?.name ?? '',
    amount: s ? centsToInput(s.cents) : '',
    currency: (s?.currency ?? DEFAULT_CURRENCY) as Currency,
    category: (s?.category ?? 'subscriptions') as CategoryKey,
    every: s?.every ?? 'month',
    interval: String(s?.interval ?? 1),
    startDay: s?.startDay ?? today,
    patterns: s?.patterns ?? [],
    weekend: s?.weekend ?? 'keep',
    ends: s?.endDay ? 'day' : s?.endAfter ? 'times' : 'never',
    endDay:
      s?.endDay ??
      format(addYears(parseDay(s?.startDay ?? today), 1), 'yyyy-MM-dd'),
    endAfter: String(s?.endAfter ?? 12),
  }

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: ({ value }) => {
        const result = subscriptionInput.safeParse(toInput(value))
        if (result.success) return undefined
        return {
          fields: Object.fromEntries(
            result.error.issues.map((i) => {
              const key = String(i.path[0])
              return [FIELD_OF[key] ?? key, i.message]
            }),
          ),
        }
      },
    },
    onSubmit: ({ value }) =>
      save.mutateAsync(subscriptionInput.parse(toInput(value))),
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
        {s ? `Edit “${s.name}”` : 'Add something recurring'}
      </h3>
      <FieldGroup>
        <form.Field
          name="kind"
          children={(field) => (
            <Field>
              <FieldLabel id="sub-kind" className="sr-only">
                Money out or in
              </FieldLabel>
              <ToggleGroup
                aria-labelledby="sub-kind"
                variant="outline"
                className="w-full *:flex-1"
                value={[field.state.value]}
                onValueChange={(value: Array<string>) => {
                  const next = value.at(-1) as EntryKind | undefined
                  if (!next || next === field.state.value) return
                  field.handleChange(next)
                  const current = form.getFieldValue('category')
                  if (!categoriesFor(next).some((c) => c.key === current)) {
                    form.setFieldValue(
                      'category',
                      next === 'income' ? 'salary' : 'subscriptions',
                    )
                  }
                }}
              >
                <ToggleGroupItem value="expense">Expense</ToggleGroupItem>
                <ToggleGroupItem value="income">Income</ToggleGroupItem>
              </ToggleGroup>
              {s && field.state.value !== s.kind && (
                <FieldDescription>
                  What it already added this month changes too.
                </FieldDescription>
              )}
            </Field>
          )}
        />
        <div className="grid grid-cols-[1fr_7rem_auto] gap-3">
          <form.Field
            name="name"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="sub-name">Name</FieldLabel>
                  <form.Subscribe
                    selector={(state) => state.values.kind}
                    children={(kind) => (
                      <Input
                        id="sub-name"
                        autoComplete="off"
                        placeholder={kind === 'income' ? 'Salary' : 'Netflix'}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                    )}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field
            name="category"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor="sub-category">Category</FieldLabel>
                <form.Subscribe
                  selector={(state) => state.values.kind}
                  children={(kind) => (
                    <CategorySelect
                      id="sub-category"
                      kind={kind}
                      value={field.state.value}
                      onChange={field.handleChange}
                      className="w-full"
                    />
                  )}
                />
              </Field>
            )}
          />
          <form.Field
            name="startDay"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor="sub-start">
                  {s ? 'Starts' : 'First time'}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sub-interval">Repeats every</FieldLabel>
            <div className="flex gap-2">
              <form.Field
                name="interval"
                children={(field) => (
                  <Input
                    id="sub-interval"
                    type="number"
                    min={1}
                    max={366}
                    className="w-20"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                )}
              />
              <form.Field
                name="every"
                children={(field) => (
                  <SimpleSelect
                    label="Unit"
                    value={field.state.value}
                    options={UNITS}
                    onChange={(v) => field.handleChange(v as Every)}
                    className="flex-1"
                  />
                )}
              />
            </div>
            <form.Subscribe
              selector={(state) => state.fieldMeta.interval?.errors ?? []}
              children={(errors) =>
                errors.length > 0 && <FieldError errors={errorsOf(errors)} />
              }
            />
          </Field>
          <form.Field
            name="weekend"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor="sub-weekend">On a weekend</FieldLabel>
                <SimpleSelect
                  id="sub-weekend"
                  value={field.state.value}
                  options={WEEKEND}
                  onChange={field.handleChange}
                  className="w-full"
                />
              </Field>
            )}
          />
        </div>
        <form.Subscribe
          selector={(state) => [state.values.every, state.values.startDay]}
          children={([every, startDay]) =>
            every === 'month' && (
              <form.Field
                name="patterns"
                children={(field) => {
                  const patterns = field.state.value
                  const set = (next: Array<Pattern>) => field.handleChange(next)
                  return (
                    <Field>
                      <FieldLabel>On</FieldLabel>
                      {patterns.map((p, i) => (
                        <div key={i} className="flex gap-2">
                          <SimpleSelect
                            label="Which"
                            value={String(whichOf(p))}
                            options={whichOptions(p)}
                            onChange={(v) =>
                              set(
                                patterns.map((q, j) =>
                                  j === i
                                    ? makePattern(whatOf(q), Number(v))
                                    : q,
                                ),
                              )
                            }
                            className="w-24"
                          />
                          <SimpleSelect
                            label="What"
                            value={whatOf(p)}
                            options={WHAT}
                            onChange={(v) =>
                              set(
                                patterns.map((q, j) =>
                                  j === i ? makePattern(v, whichOf(q)) : q,
                                ),
                              )
                            }
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove this day"
                            onClick={() =>
                              set(patterns.filter((_, j) => j !== i))
                            }
                          >
                            <XIcon />
                          </Button>
                        </div>
                      ))}
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={patterns.length >= 10}
                          onClick={() =>
                            set([
                              ...patterns,
                              patterns.length === 0
                                ? {
                                    type: 'day',
                                    day: parseDay(startDay).getDate(),
                                  }
                                : { type: 'day', day: -1 },
                            ])
                          }
                        >
                          <PlusIcon data-icon="inline-start" />
                          Add a day
                        </Button>
                      </div>
                      <FieldDescription>
                        {patterns.length === 0
                          ? `The same day each month as the first time (the ${ordinal(parseDay(startDay).getDate())}). Add days for “the last working day”, “the 1st and 15th”, “the 2nd Friday”…`
                          : 'Each of these days, every month it repeats.'}
                      </FieldDescription>
                    </Field>
                  )
                }}
              />
            )
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field
            name="ends"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor="sub-ends">Ends</FieldLabel>
                <SimpleSelect
                  id="sub-ends"
                  value={field.state.value}
                  options={ENDS}
                  onChange={field.handleChange}
                  className="w-full"
                />
              </Field>
            )}
          />
          <form.Subscribe
            selector={(state) => state.values.ends}
            children={(ends) =>
              ends === 'day' ? (
                <form.Field
                  name="endDay"
                  children={(field) => {
                    const isInvalid = field.state.meta.errors.length > 0
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor="sub-end-day">Last day</FieldLabel>
                        <DayPicker
                          id="sub-end-day"
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                        {isInvalid && (
                          <FieldError
                            errors={errorsOf(field.state.meta.errors)}
                          />
                        )}
                      </Field>
                    )
                  }}
                />
              ) : ends === 'times' ? (
                <form.Field
                  name="endAfter"
                  children={(field) => {
                    const isInvalid = field.state.meta.errors.length > 0
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor="sub-end-after">Times</FieldLabel>
                        <Input
                          id="sub-end-after"
                          type="number"
                          min={1}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && (
                          <FieldError
                            errors={errorsOf(field.state.meta.errors)}
                          />
                        )}
                      </Field>
                    )
                  }}
                />
              ) : null
            }
          />
        </div>
        <form.Subscribe
          selector={(state) => state.values}
          children={(values) => <Preview values={values} today={today} />}
        />
      </FieldGroup>
      <div className="flex justify-between gap-2">
        {s ? (
          <Button
            type="button"
            variant="outline"
            disabled={remove.isPending}
            onClick={() => remove.mutate(s.id)}
          >
            <Trash2Icon data-icon="inline-start" />
            Stop it
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {s && (
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
                  !s && <PlusIcon data-icon="inline-start" />
                )}
                {s ? 'Save' : 'Add'}
              </Button>
            )}
          />
        </div>
      </div>
    </form>
  )
}

/** The schedule in words and its next few days, as the form is filled. */
function Preview({ values, today }: { values: FormValues; today: string }) {
  const input = subscriptionInput.safeParse({
    ...toInput(values),
    // The preview only needs the schedule.
    name: values.name || 'x',
    cents: 1,
  })
  if (!input.success) return null
  const next = upcoming(input.data, today, null, 4)
  return (
    <p className="text-sm text-muted-foreground">
      {describeSchedule(input.data)}.{' '}
      {next.length > 0
        ? `Next: ${next.map((d) => format(parseDay(d), 'EEE d MMM yyyy')).join(' · ')}`
        : 'No more days after today.'}
    </p>
  )
}
