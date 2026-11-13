import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { toast } from '@/components/ui/toast'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { category } from '@/lib/finances/categories'
import { formatMoney } from '@/lib/finances/money'
import {
  categorizeFinanceEntries,
  createFinanceEntry,
  financesQueryOptions,
} from '@/server/finances.functions'

// Saving a new entry (the money pop-up): a
// toast says what was saved, then (with auto-categorize) the AI is asked
// for a category, so saving never waits for it.

// Whether new entries are sent to the AI for a category (per browser).
const AUTO_KEY = 'finances:auto'

/** The auto-categorize toggle, remembered in this browser. */
export function useAutoCategorize() {
  const [auto, setAuto] = useState(false)
  useEffect(() => {
    try {
      setAuto(localStorage.getItem(AUTO_KEY) === '1')
    } catch {
      // Off.
    }
  }, [])
  const change = (pressed: boolean) => {
    setAuto(pressed)
    try {
      localStorage.setItem(AUTO_KEY, pressed ? '1' : '0')
    } catch {
      // Not kept; fine.
    }
  }
  return [auto, change] as const
}

export type NewEntry = Parameters<typeof createFinanceEntry>[0]['data']

export function useAddEntry({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient()

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

  return useMutation({
    mutationFn: (input: NewEntry) => createFinanceEntry({ data: input }),
    onSuccess: async ({ id }, input) => {
      onSaved?.()
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
}
