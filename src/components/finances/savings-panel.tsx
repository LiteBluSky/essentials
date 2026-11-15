import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
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
  addToSaving,
  createSaving,
  deleteSaving,
  financesQueryOptions,
  updateSaving,
} from '@/server/finances.functions'
import { DeleteConfirm } from './entry-dialog'
import { CurrencySelect } from './pickers'

/**
 * The Savings tab: things the user saves up for. Each goal has a price and
 * a gauge that fills as money is put in, until it's full and the thing can
 * be bought. Not an expense and not a budget: no category, no month, it
 * never resets; putting money in doesn't touch the month's entries.
 */
export function SavingsPanel({ savings }: { savings: Array<FinanceSaving> }) {
  return (
    <section className="flex flex-col gap-6">
      {savings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Saving up for something? Add it below with its price, then put money
          in whenever you can: its gauge fills up until you can buy it.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {savings.map((saving) => (
            <SavingRow key={saving.id} saving={saving} />
          ))}
        </ul>
      )}
      <Separator />
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          New savings goal
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

  const ready = saving.savedCents >= saving.cents
  const ratio = saving.cents > 0 ? saving.savedCents / saving.cents : 0
  const percent = Math.min(100, Math.floor(ratio * 100))
  const money = (cents: number) => formatMoney(cents, saving.currency)

  const deposit = useMutation({
    mutationFn: (cents: number) =>
      addToSaving({ data: { id: saving.id, cents } }),
    onSuccess: async (row) => {
      setAmount('')
      await queryClient.invalidateQueries(financesQueryOptions)
      const full = row.savedCents >= row.cents
      toast.add({
        title: full
          ? `${row.name}: ready to buy!`
          : `${formatMoney(row.cents - row.savedCents, row.currency)} to go for ${row.name}`,
        type: 'success',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't put the money in",
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
        title: ready ? `Enjoy your ${saving.name}!` : 'Deleted',
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
  const putIn = () => {
    if (cents !== null && !deposit.isPending) deposit.mutate(cents)
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-medium">{saving.name}</span>
        {ready && <Badge>Ready to buy</Badge>}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${saving.name}`}
          title="Edit"
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ready ? `Bought ${saving.name}` : `Delete ${saving.name}`}
          title={ready ? 'Bought it' : 'Delete'}
          onClick={() => setRemoving(true)}
        >
          {ready ? <ShoppingBagIcon /> : <Trash2Icon />}
        </Button>
      </div>
      <Progress
        value={percent}
        aria-label={`${saving.name}: ${percent}% saved`}
        className={cn(
          'h-3',
          ready && '[&_[data-slot=progress-indicator]]:bg-success',
        )}
      />
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="tabular-nums">
          {money(saving.savedCents)}
          <span className="text-muted-foreground">
            {' '}
            of {money(saving.cents)} · {percent}%
          </span>
        </span>
        <span
          className={cn(
            'text-muted-foreground tabular-nums',
            ready && 'text-success',
          )}
        >
          {ready
            ? 'You can buy it'
            : `${money(saving.cents - saving.savedCents)} to go`}
        </span>
      </div>
      <InputGroup className="sm:max-w-64">
        <InputGroupInput
          aria-label={`Put money into ${saving.name}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Put money in"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') putIn()
          }}
          aria-invalid={amount.trim() !== '' && cents === null}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            disabled={cents === null || deposit.isPending}
            onClick={putIn}
          >
            {deposit.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PiggyBankIcon data-icon="inline-start" />
            )}
            Add
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit savings goal</DialogTitle>
            <DialogDescription>
              What you're saving for, its price and what's saved so far.
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
            Add goal
          </Button>
        </div>
      )}
    />
  )
}

/** New goal (no `saving`) or edit one (also its saved amount). */
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
    price: string
    currency: Currency
    saved: string
  }) => ({
    name: value.name,
    cents: parseAmount(value.price) ?? 0,
    currency: value.currency,
    savedCents: parseSaved(value.saved),
  })

  const form = useForm({
    defaultValues: {
      name: saving?.name ?? '',
      price: saving ? centsToInput(saving.cents) : '',
      currency: (saving?.currency ?? DEFAULT_CURRENCY) as Currency,
      saved: saving ? centsToInput(saving.savedCents) : '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = savingInput.safeParse(toInput(value))
        if (result.success) return undefined
        const field = (key: PropertyKey) =>
          key === 'cents' ? 'price' : key === 'savedCents' ? 'saved' : key
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
                <FieldLabel htmlFor={`${id}-name`}>What for</FieldLabel>
                <Input
                  id={`${id}-name`}
                  autoComplete="off"
                  placeholder="A new bike"
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
            name="price"
            children={(field) => {
              const isInvalid = field.state.meta.errors.length > 0
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={`${id}-price`}>Price</FieldLabel>
                  <Input
                    id={`${id}-price`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
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
                  {saving ? 'Saved so far' : 'Already saved (optional)'}
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

/** What's saved so far: empty or zero = 0; -1 when it isn't an amount. */
function parseSaved(text: string) {
  if (/^\s*0*([.,]0*)?\s*$/.test(text)) return 0
  return parseAmount(text) ?? -1
}
