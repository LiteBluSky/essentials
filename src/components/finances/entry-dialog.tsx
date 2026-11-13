import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FinanceEntry } from '@/db/schema'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import { UNCATEGORIZED, categoriesFor } from '@/lib/finances/categories'
import type { CategoryKey, EntryKind } from '@/lib/finances/categories'
import { centsToInput, parseAmount } from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'
import { entryInput } from '@/lib/finances/schemas'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import {
  deleteFinanceEntry,
  financesQueryOptions,
  updateFinanceEntry,
} from '@/server/finances.functions'
import { CategorySelect, CurrencySelect, DayPicker } from './pickers'

/** Edit (or delete) one entry. */
export function EntryDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: FinanceEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <EntryForm
            key={entry.id}
            entry={entry}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EntryForm({
  entry,
  onDone,
}: {
  entry: FinanceEntry
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = useMutation({
    mutationFn: (value: Parameters<typeof updateFinanceEntry>[0]['data']) =>
      updateFinanceEntry({ data: value }),
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

  const form = useForm({
    defaultValues: {
      kind: entry.kind,
      amount: centsToInput(entry.cents),
      currency: entry.currency as Currency,
      title: entry.title,
      category: entry.category as CategoryKey,
      day: entry.day,
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = entryInput.safeParse({
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
      save.mutateAsync({
        id: entry.id,
        ...value,
        cents: parseAmount(amount) ?? 0,
      }),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit</DialogTitle>
        <DialogDescription>
          {entry.subscriptionId !== null
            ? 'A subscription charge.'
            : 'Money in or out.'}
        </DialogDescription>
      </DialogHeader>
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
            name="kind"
            children={(field) => (
              <Field>
                <FieldLabel id="entry-kind">Type</FieldLabel>
                <ToggleGroup
                  aria-labelledby="entry-kind"
                  variant="outline"
                  value={[field.state.value]}
                  onValueChange={(value: Array<string>) => {
                    const next = value.at(-1) as EntryKind | undefined
                    if (!next) return
                    field.handleChange(next)
                    // Keep the category only if it fits the new type.
                    const current = form.getFieldValue('category')
                    if (!categoriesFor(next).some((c) => c.key === current)) {
                      form.setFieldValue('category', UNCATEGORIZED)
                    }
                  }}
                >
                  <ToggleGroupItem value="expense">Expense</ToggleGroupItem>
                  <ToggleGroupItem value="income">Income</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
          />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <form.Field
              name="amount"
              children={(field) => {
                const isInvalid = field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Amount</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      inputMode="decimal"
                      autoComplete="off"
                      autoFocus
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError
                        errors={field.state.meta.errors.map((m) => ({
                          message: String(m),
                        }))}
                      />
                    )}
                  </Field>
                )
              }}
            />
            <form.Field
              name="currency"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor="entry-currency">Currency</FieldLabel>
                  <CurrencySelect
                    id="entry-currency"
                    value={field.state.value}
                    onChange={field.handleChange}
                    className="w-24"
                  />
                </Field>
              )}
            />
          </div>
          <form.Field
            name="title"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>What was it</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="off"
                  placeholder="Optional"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </Field>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <form.Subscribe
              selector={(s) => s.values.kind}
              children={(kind) => (
                <form.Field
                  name="category"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="entry-category">Category</FieldLabel>
                      <CategorySelect
                        id="entry-category"
                        kind={kind}
                        value={field.state.value}
                        onChange={field.handleChange}
                        className="w-full"
                      />
                    </Field>
                  )}
                />
              )}
            />
            <form.Field
              name="day"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor="entry-day">Day</FieldLabel>
                  <DayPicker
                    id="entry-day"
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                </Field>
              )}
            />
          </div>
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  Save
                </Button>
              )}
            />
          </div>
        </DialogFooter>
      </form>
      <DeleteEntryDialog
        entry={entry}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={onDone}
      />
    </>
  )
}

function DeleteEntryDialog({
  entry,
  open,
  onOpenChange,
  onDeleted,
}: {
  entry: FinanceEntry
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteFinanceEntry({ data: { id: entry.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(financesQueryOptions)
      onOpenChange(false)
      onDeleted()
      toast.add({ title: 'Deleted', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {open && (
          <DeleteConfirm
            label={entry.title}
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "Delete …?" (`d` confirms, so `d` `d` deletes). */
export function DeleteConfirm({
  label,
  pending,
  onConfirm,
}: {
  label: string
  pending: boolean
  onConfirm: () => void
}) {
  useConfirmKey('d', onConfirm)
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Delete {label ? `“${label}”` : 'this'}?
        </AlertDialogTitle>
        <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={pending}
          onClick={onConfirm}
        >
          Delete
          <Kbd>d</Kbd>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
