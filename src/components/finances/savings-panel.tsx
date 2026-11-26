import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpFromLineIcon,
  PencilIcon,
  PiggyBankIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'

import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import type { FinanceSaving } from '@/db/schema'
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  centsToInput,
  formatMoney,
  parseAmount,
} from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'
import { savingInput } from '@/lib/finances/schemas'
import type { SavingInput } from '@/lib/finances/schemas'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import { cn } from '@/lib/utils'
import {
  createSaving,
  deleteSaving,
  financesQueryOptions,
  moveSavingMoney,
  updateSaving,
} from '@/server/finances.functions'
import { DeleteConfirm } from './entry-dialog'
import { CurrencySelect } from './pickers'
import { Hint } from '@/components/hint'

/**
 * The Savings tab: savings accounts, places to keep money apart from the
 * wallet (an emergency fund, holidays, a new car). Putting money in is an
 * expense (category Savings): it comes off what's left that month; taking
 * it out is income again. Each account can have a goal (an amount to
 * reach, with a gauge), or none.
 */
export function SavingsPanel({ savings }: { savings: Array<FinanceSaving> }) {
  // What's kept in savings, per currency (euros first).
  const totals = CURRENCIES.map((currency) => ({
    currency,
    cents: savings
      .filter((s) => s.currency === currency)
      .reduce((sum, s) => sum + s.savedCents, 0),
    count: savings.filter((s) => s.currency === currency).length,
  })).filter((t) => t.count > 0)

  return (
    <section className="flex flex-col gap-6">
      {savings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keep money apart from your wallet: an emergency fund, holidays, a new
          car. Money you put in counts as spent (it comes off what's left this
          month) and comes back when you take it out. Give one a goal to fill
          up, or none.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-sm text-muted-foreground">In savings</span>
              {totals.map((t) => (
                <span
                  key={t.currency}
                  className="text-2xl font-semibold tabular-nums"
                >
                  {formatMoney(t.cents, t.currency)}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Putting money in counts as spent this month; taking it out gives
              it back.
            </p>
          </div>
          <ul className="flex flex-col gap-6">
            {savings.map((saving) => (
              <SavingRow key={saving.id} saving={saving} />
            ))}
          </ul>
        </>
      )}
      <Separator />
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          New savings account
        </h2>
        <NewSaving />
      </div>
    </section>
  )
}

function SavingRow({ saving }: { saving: FinanceSaving }) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)

  const goal = saving.cents
  const reached = goal !== null && saving.savedCents >= goal
  const percent =
    goal === null || goal === 0
      ? 0
      : Math.min(100, Math.floor((saving.savedCents / goal) * 100))
  const money = (cents: number) => formatMoney(cents, saving.currency)

  const move = useMutation({
    mutationFn: (input: { cents: number; direction: 'in' | 'out' }) =>
      moveSavingMoney({ data: { id: saving.id, ...input } }),
    onSuccess: async ({ saving: row }, input) => {
      setAmount('')
      await queryClient.invalidateQueries(financesQueryOptions)
      const moved = formatMoney(input.cents, row.currency)
      toast.add({
        title:
          input.direction === 'in'
            ? `${moved} put into ${row.name}`
            : `${moved} taken out of ${row.name}`,
        description:
          row.cents !== null && row.savedCents >= row.cents
            ? 'Goal reached!'
            : row.cents !== null
              ? `${formatMoney(row.cents - row.savedCents, row.currency)} to go`
              : `${formatMoney(row.savedCents, row.currency)} in it`,
        type: 'success',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't move the money",
        description: error.message,
        type: 'error',
      }),
  })

  const remove = useMutation({
    mutationFn: () => deleteSaving({ data: { id: saving.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(financesQueryOptions)
      setRemoving(false)
      toast.add({
        title: reached ? `Enjoy your ${saving.name}!` : 'Deleted',
        type: 'success',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })

  const cents = parseAmount(amount)
  const moveMoney = (direction: 'in' | 'out') => {
    if (cents !== null && !move.isPending) move.mutate({ cents, direction })
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-medium">{saving.name}</span>
        {reached && <Badge>Goal reached</Badge>}
        <Hint label={'Edit'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${saving.name}`}
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </Button>
        </Hint>
        <Hint label={reached ? 'Bought it' : 'Delete'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              reached ? `Bought ${saving.name}` : `Delete ${saving.name}`
            }
            onClick={() => setRemoving(true)}
          >
            {reached ? <ShoppingBagIcon /> : <Trash2Icon />}
          </Button>
        </Hint>
      </div>
      {goal === null ? (
        <span className="text-xl font-semibold tabular-nums">
          {money(saving.savedCents)}
        </span>
      ) : (
        <>
          <Progress
            value={percent}
            aria-label={`${saving.name}: ${percent}% of the goal`}
            className={cn(
              'h-3',
              reached && '[&_[data-slot=progress-indicator]]:bg-success',
            )}
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="tabular-nums">
              {money(saving.savedCents)}
              <span className="text-muted-foreground">
                {' '}
                of {money(goal)} · {percent}%
              </span>
            </span>
            <span
              className={cn(
                'text-muted-foreground tabular-nums',
                reached && 'text-success',
              )}
            >
              {reached
                ? 'You can buy it'
                : `${money(goal - saving.savedCents)} to go`}
            </span>
          </div>
        </>
      )}
      <InputGroup className="sm:max-w-80">
        <InputGroupInput
          aria-label={`Amount to put into or take out of ${saving.name}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') moveMoney('in')
          }}
          aria-invalid={amount.trim() !== '' && cents === null}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            disabled={
              cents === null || move.isPending || cents > saving.savedCents
            }
            onClick={() => moveMoney('out')}
          >
            <ArrowUpFromLineIcon data-icon="inline-start" />
            Take out
          </InputGroupButton>

          <InputGroupButton
            variant="secondary"
            disabled={cents === null || move.isPending}
            onClick={() => moveMoney('in')}
          >
            {move.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PiggyBankIcon data-icon="inline-start" />
            )}
            Put in
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit savings account</DialogTitle>
            <DialogDescription>
              Its name, an optional goal, and what's in it. Changing the amount
              here is a correction: it doesn't touch your wallet (use Put in /
              Take out for that).
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <SavingForm
              saving={saving}
              onDone={() => setEditing(false)}
              footer={(submitting) => (
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Spinner data-icon="inline-start" />}
                    Save
                  </Button>
                </DialogFooter>
              )}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          {removing && (
            <DeleteConfirm
              label={saving.name}
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
              description={
                saving.savedCents > 0 && !reached
                  ? `The ${money(saving.savedCents)} in it stays counted as spent: take it out first to have it back in your wallet.`
                  : undefined
              }
            />
          )}
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function NewSaving() {
  // Remounted after each save to start empty again.
  const [key, setKey] = useState(0)
  return (
    <SavingForm
      key={key}
      onDone={() => setKey((k) => k + 1)}
      footer={(submitting) => (
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            Add account
          </Button>
        </div>
      )}
    />
  )
}

/** New account (no `saving`) or edit one (also what's in it). */
function SavingForm({
  saving,
  onDone,
  footer,
}: {
  saving?: FinanceSaving
  onDone: () => void
  footer: (submitting: boolean) => React.ReactNode
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async (value: SavingInput) => {
      if (saving) await updateSaving({ data: { id: saving.id, ...value } })
      else await createSaving({ data: value })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(financesQueryOptions)
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save",
        description: error.message,
        type: 'error',
      }),
  })

  const toInput = (value: {
    name: string
    goal: string
    currency: Currency
    saved: string
  }) => ({
    name: value.name,
    cents: value.goal.trim() === '' ? null : (parseAmount(value.goal) ?? 0),
    currency: value.currency,
    savedCents: parseSaved(value.saved),
  })

  const form = useForm({
    defaultValues: {
      name: saving?.name ?? '',
      goal:
        saving?.cents === null || saving?.cents === undefined
          ? ''
          : centsToInput(saving.cents),
      currency: (saving?.currency ?? DEFAULT_CURRENCY) as Currency,
      saved: saving ? centsToInput(saving.savedCents) : '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = savingInput.safeParse(toInput(value))
        if (result.success) return undefined
        const field = (key: PropertyKey) =>
          key === 'cents' ? 'goal' : key === 'savedCents' ? 'saved' : key
        return {
          fields: Object.fromEntries(
            result.error.issues.map((i) => [
              String(field(i.path[0])),
              i.path[0] === 'savedCents' ? 'Enter an amount' : i.message,
            ]),
          ),
        }
      },
    },
    onSubmit: ({ value }) => save.mutateAsync(toInput(value)),
  })

  const id = saving ? `saving-${saving.id}` : 'saving-new'
  const errors = (meta: { errors: Array<unknown> }) =>
    meta.errors.map((m) => ({ message: String(m) }))

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      onKeyDownCapture={submitOnModEnter(() => void form.handleSubmit())}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field
          name="name"
          children={(field) => {
            const isInvalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                <Input
                  id={`${id}-name`}
                  autoComplete="off"
                  placeholder="Emergency fund, New car…"
                  autoFocus={!!saving}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={errors(field.state.meta)} />}
              </Field>
            )
          }}
        />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <form.Field
            name="goal"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={`${id}-goal`}>
                    Goal (optional)
                  </FieldLabel>
                  <Input
                    id={`${id}-goal`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="None"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && (
                    <FieldError errors={errors(field.state.meta)} />
                  )}
                </Field>
              )
            }}
          />
          <form.Field
            name="currency"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor={`${id}-currency`}>Currency</FieldLabel>
                <CurrencySelect
                  id={`${id}-currency`}
                  value={field.state.value}
                  onChange={field.handleChange}
                  className="w-24"
                />
              </Field>
            )}
          />
        </div>
        <form.Field
          name="saved"
          children={(field) => {
            const isInvalid = field.state.meta.errors.length > 0
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={`${id}-saved`}>
                  {saving ? 'In it now' : 'Already in it (optional)'}
                </FieldLabel>
                <Input
                  id={`${id}-saved`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {!saving && (
                  <FieldDescription>
                    Money that's already saved somewhere: not taken from your
                    wallet.
                  </FieldDescription>
                )}
                {isInvalid && <FieldError errors={errors(field.state.meta)} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => footer(isSubmitting)}
      />
    </form>
  )
}

/** What's in it: empty or zero = 0; -1 when it isn't an amount. */
function parseSaved(text: string) {
  if (/^\s*0*([.,]0*)?\s*$/.test(text)) return 0
  return parseAmount(text) ?? -1
}
