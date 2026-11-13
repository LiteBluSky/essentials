import { useSuspenseQuery } from '@tanstack/react-query'
import { MinusIcon, PlusIcon, SparklesIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Toggle } from '@/components/ui/toggle'
import { useAddEntry, useAutoCategorize } from '@/hooks/finances/use-add-entry'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { UNCATEGORIZED, categoriesFor } from '@/lib/finances/categories'
import type { CategoryKey, EntryKind } from '@/lib/finances/categories'
import { CURRENCIES, DEFAULT_CURRENCY } from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import { cn } from '@/lib/utils'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import { CategorySelect } from './pickers'

/** At most 99,999,999.99 (the schema's limit is just above). */
const MAX_DIGITS = 10

/** "€", "$", "£", "CHF". */
function currencySymbol(currency: Currency) {
  return (
    new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  )
}

/** Cents as "1,234.56". */
function amountText(cents: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Adding money by hand, like a till: one big amount where the digits come
 * in from the right (6 → 0.06, 600 → 6.00, 60000 → 600.00; backspace
 * takes the last one off), with a −/+ in front of it to switch between
 * money out and in; then a small "what was it", the auto-categorize toggle
 * and an optional category; the currency (euros by default) after the
 * amount. Saved today (the entry can be edited after).
 */
export function AmountDialog({
  open,
  onOpenChange,
  kind: initialKind,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: EntryKind
  today: string
}) {
  const { data: aiAvailable } = useSuspenseQuery(assistantEnabledQueryOptions)
  const [kind, setKind] = useState<EntryKind>(initialKind)
  const [cents, setCents] = useState(0)
  const [title, setTitle] = useState('')
  const [categoryKey, setCategoryKey] = useState<CategoryKey>(UNCATEGORIZED)
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY)
  const [auto, setAuto] = useAutoCategorize()
  const amountRef = useRef<HTMLInputElement>(null)

  // Fresh each time it opens.
  useEffect(() => {
    if (!open) return
    setKind(initialKind)
    setCents(0)
    setTitle('')
    setCategoryKey(UNCATEGORIZED)
    setCurrency(DEFAULT_CURRENCY)
  }, [open, initialKind])

  const save = useAddEntry({ onSaved: () => onOpenChange(false) })

  const picked = categoriesFor(kind).some((c) => c.key === categoryKey)
    ? categoryKey
    : UNCATEGORIZED

  const submit = () => {
    if (save.isPending) return
    if (cents <= 0) {
      amountRef.current?.focus()
      return
    }
    const text = title.trim()
    save.mutate({
      kind,
      cents,
      currency,
      title: text.charAt(0).toUpperCase() + text.slice(1),
      category: picked,
      day: today,
      autoCategorize: aiAvailable && auto && picked === UNCATEGORIZED && !!text,
    })
  }

  // The caret always stays at the end, so typing appends and backspace
  // takes the last digit off.
  const caretToEnd = (input: HTMLInputElement) => {
    const end = input.value.length
    if (input.selectionStart !== end || input.selectionEnd !== end) {
      input.setSelectionRange(end, end)
    }
  }

  const income = kind === 'income'
  const SignIcon = income ? PlusIcon : MinusIcon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{income ? 'Money in' : 'Money out'}</DialogTitle>
          <DialogDescription>
            Type the amount: the digits come in from the right.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          onKeyDownCapture={submitOnModEnter(submit)}
        >
          {/* −/+ | amount | currency, both the same size so the amount
              stays centred. */}
          <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label={
                income
                  ? 'Money in (switch to money out)'
                  : 'Money out (switch to money in)'
              }
              title={income ? 'Money in' : 'Money out'}
              onClick={() => setKind(income ? 'expense' : 'income')}
            >
              <SignIcon className={cn(income && 'text-success')} />
            </Button>
            <Input
              ref={amountRef}
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              aria-label="Amount"
              size={1}
              value={amountText(cents)}
              onChange={(e) => {
                const digits = e.target.value
                  .replace(/\D/g, '')
                  .replace(/^0+/, '')
                  .slice(0, MAX_DIGITS)
                setCents(Number(digits || '0'))
              }}
              onFocus={(e) => caretToEnd(e.currentTarget)}
              onSelect={(e) => caretToEnd(e.currentTarget)}
              onClick={(e) => caretToEnd(e.currentTarget)}
              className={cn(
                'h-auto w-full min-w-0 border-0 bg-transparent! py-2 text-center text-4xl! font-semibold tabular-nums shadow-none focus-visible:ring-0 sm:text-5xl! dark:bg-transparent!',
                income && 'text-success',
              )}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={`Currency: ${currency}`}
                    title={`Currency: ${currency}`}
                  />
                }
              >
                <span
                  className={cn(
                    currencySymbol(currency).length > 1 && 'text-xs',
                  )}
                >
                  {currencySymbol(currency)}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Currency</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={currency}
                    onValueChange={(value: string) =>
                      setCurrency(value as Currency)
                    }
                  >
                    {CURRENCIES.map((c) => (
                      <DropdownMenuRadioItem key={c} value={c}>
                        {currencySymbol(c)} {c}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Input
            aria-label="What was it?"
            placeholder={income ? 'Paid back by Ana' : 'Coffee'}
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex min-w-0 items-center gap-2">
            {aiAvailable && (
              <Toggle
                variant="outline"
                pressed={auto}
                onPressedChange={setAuto}
                title={`${ASSISTANT_NAME} picks a category when you don't`}
              >
                <SparklesIcon />
                Auto-categorize
              </Toggle>
            )}
            <CategorySelect
              kind={kind}
              value={picked}
              onChange={setCategoryKey}
              className="min-w-0 flex-1"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={cents <= 0 || save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
