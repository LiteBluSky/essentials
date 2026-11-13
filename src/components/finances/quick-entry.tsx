import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  MinusIcon,
  PlusIcon,
  SendHorizontalIcon,
  SparklesIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { DictateButton } from '@/components/dictate-button'
import { MobileDock } from '@/components/mobile-dock'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Toggle } from '@/components/ui/toggle'
import { toast } from '@/components/ui/toast'
import { useDictation } from '@/hooks/use-dictation'
import { ASSISTANT_NAME } from '@/lib/assistant'
import {
  UNCATEGORIZED,
  categoriesFor,
  category,
} from '@/lib/finances/categories'
import type { CategoryKey, EntryKind } from '@/lib/finances/categories'
import { DEFAULT_CURRENCY, formatMoney, parseEntry } from '@/lib/finances/money'
import type { Currency } from '@/lib/finances/money'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import {
  categorizeFinanceEntries,
  createFinanceEntry,
  financesQueryOptions,
} from '@/server/finances.functions'
import { CategorySelect, CurrencySelect, DayPicker } from './pickers'

// Whether new entries are sent to the AI for a category (per browser).
const AUTO_KEY = 'finances:auto'

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The quick entry: type the amount and what it was ("12.50 coffee",
 * "+1800 payroll") and press Enter. Everything else is optional and goes
 * back to its default after each entry: expense, euros, uncategorized,
 * today. With the ✨ toggle on (and an API key), an entry saved without a
 * category is sent to the AI for one, after it's saved.
 */
export function QuickEntry({
  today,
  inputRef,
}: {
  today: string
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const queryClient = useQueryClient()
  const { data: aiAvailable } = useSuspenseQuery(assistantEnabledQueryOptions)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<EntryKind>('expense')
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY)
  const [categoryKey, setCategoryKey] = useState<CategoryKey>(UNCATEGORIZED)
  const [day, setDay] = useState(today)
  const [auto, setAuto] = useState(false)
  useEffect(() => setAuto(readAuto()), [])
  useEffect(() => setDay(today), [today])
  // Say it instead ("twelve fifty coffee"): the browser's own dictation.
  const dictation = useDictation({
    onText: setText,
    onError: (message) =>
      toast.add({
        title: "Couldn't listen",
        description: message,
        type: 'error',
      }),
  })

  const parsed = parseEntry(text)
  // A typed sign / currency wins over the toggles.
  const shownKind = parsed?.kind ?? kind

  const categorize = useMutation({
    mutationFn: (id: number) =>
      categorizeFinanceEntries({ data: { ids: [id] } }),
    onSuccess: () => queryClient.invalidateQueries(financesQueryOptions),
    onError: (error) =>
      toast.add({
        title: "Couldn't categorize it",
        description: error.message,
        type: 'error',
      }),
  })

  const save = useMutation({
    mutationFn: (input: Parameters<typeof createFinanceEntry>[0]['data']) =>
      createFinanceEntry({ data: input }),
    onSuccess: async ({ id }, input) => {
      setText('')
      setKind('expense')
      setCurrency(DEFAULT_CURRENCY)
      setCategoryKey(UNCATEGORIZED)
      setDay(today)
      await queryClient.invalidateQueries(financesQueryOptions)
      toast.add({
        title: `${input.kind === 'income' ? '+' : '−'}${formatMoney(input.cents, input.currency)}${input.title ? ` · ${input.title}` : ''}`,
        description: input.autoCategorize
          ? `${ASSISTANT_NAME} is picking a category…`
          : category(input.category).label,
        type: 'success',
      })
      if (input.autoCategorize) categorize.mutate(id)
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save",
        description: error.message,
        type: 'error',
      }),
  })

  const submit = () => {
    if (save.isPending) return
    dictation.stop()
    if (!parsed) {
      toast.add({
        title: 'Type an amount',
        description: 'For example “12.50 coffee”, or “+1800 payroll”.',
        type: 'warning',
      })
      return
    }
    const entryKind = parsed.kind ?? kind
    // A category picked for the other kind doesn't carry over.
    const picked = categoriesFor(entryKind).some((c) => c.key === categoryKey)
      ? categoryKey
      : UNCATEGORIZED
    save.mutate({
      kind: entryKind,
      cents: parsed.cents,
      currency: parsed.currency ?? currency,
      title: parsed.title,
      category: picked,
      day,
      autoCategorize:
        aiAvailable && auto && picked === UNCATEGORIZED && !!parsed.title,
    })
  }

  const KindIcon = shownKind === 'income' ? PlusIcon : MinusIcon

  // On phones it's pinned to the bottom like Jarvis's box (MobileDock): the
  // mic on the left, bigger buttons, the options in one sideways row.
  return (
    <MobileDock>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <InputGroup className="h-11 max-lg:h-14">
          <InputGroupAddon>
            <DictateButton
              dictation={dictation}
              value={text}
              disabled={save.isPending}
              size="icon-sm"
              className="size-10 lg:hidden"
            />
            <InputGroupButton
              size="icon-sm"
              className="max-lg:size-10"
              variant={shownKind === 'income' ? 'default' : 'secondary'}
              aria-label={
                shownKind === 'income'
                  ? 'Income (switch to expense)'
                  : 'Expense (switch to income)'
              }
              title={shownKind === 'income' ? 'Income' : 'Expense'}
              onClick={() =>
                setKind((k) => (k === 'income' ? 'expense' : 'income'))
              }
            >
              <KindIcon />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              dictation.finish()
              e.currentTarget.blur()
            }}
            placeholder="12.50 coffee  ·  +1800 payroll"
            aria-label="Amount and what it was"
            autoComplete="off"
            inputMode="text"
            className="text-base"
          />
          <InputGroupAddon align="inline-end">
            {parsed && (
              <span className="text-muted-foreground tabular-nums max-lg:hidden">
                {shownKind === 'income' ? '+' : '−'}
                {formatMoney(parsed.cents, parsed.currency ?? currency)}
              </span>
            )}
            <DictateButton
              dictation={dictation}
              value={text}
              disabled={save.isPending}
              size="icon-sm"
              className="max-lg:hidden"
            />
            <InputGroupButton
              type="submit"
              size="icon-sm"
              className="max-lg:size-10"
              aria-label="Save"
              title="Save (Enter)"
              disabled={!text.trim() || save.isPending}
            >
              {save.isPending ? <Spinner /> : <SendHorizontalIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <div className="flex items-center gap-2 max-lg:overflow-x-auto lg:flex-wrap [&>*]:shrink-0">
          <CurrencySelect
            value={parsed?.currency ?? currency}
            onChange={setCurrency}
            className="w-24"
          />
          <CategorySelect
            kind={shownKind}
            value={
              categoriesFor(shownKind).some((c) => c.key === categoryKey)
                ? categoryKey
                : UNCATEGORIZED
            }
            onChange={setCategoryKey}
            className="w-44"
          />
          <DayPicker value={day} onChange={setDay} compact />
          {aiAvailable && (
            <Toggle
              variant="outline"
              pressed={auto}
              onPressedChange={(pressed) => {
                setAuto(pressed)
                try {
                  localStorage.setItem(AUTO_KEY, pressed ? '1' : '0')
                } catch {
                  // Not kept; fine.
                }
              }}
              title={`${ASSISTANT_NAME} picks a category when you don't`}
            >
              <SparklesIcon />
              Auto-categorize
            </Toggle>
          )}
        </div>
      </form>
    </MobileDock>
  )
}
