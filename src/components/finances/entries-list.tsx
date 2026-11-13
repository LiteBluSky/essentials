import { format } from 'date-fns'
import { RepeatIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FinanceEntry } from '@/db/schema'
import { category } from '@/lib/finances/categories'
import { formatMoney } from '@/lib/finances/money'
import { parseDay } from './pickers'

/** The month's entries, latest first; a click edits one. */
export function EntriesList({
  entries,
  onOpen,
}: {
  entries: Array<FinanceEntry>
  onOpen: (entry: FinanceEntry) => void
}) {
  return (
    <ul className="flex flex-col">
      {entries.map((e) => {
        const c = category(e.category)
        return (
          <li key={e.id}>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 py-2 font-normal"
              onClick={() => onOpen(e)}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: c.color }}
              />
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className="flex max-w-full items-center gap-1.5 truncate">
                  {e.title || c.label}
                  {e.subscriptionId !== null && (
                    <RepeatIcon
                      aria-label="Recurring"
                      className="text-muted-foreground"
                    />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(parseDay(e.day), 'EEE d MMM')}
                  {e.title ? ` · ${c.label}` : ''}
                </span>
              </span>
              <span
                className={cn(
                  'tabular-nums',
                  e.kind === 'income' && 'text-success',
                )}
              >
                {e.kind === 'income' ? '+' : '−'}
                {formatMoney(e.cents, e.currency)}
              </span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
