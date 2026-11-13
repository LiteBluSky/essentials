import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CheckIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { toast } from '@/components/ui/toast'
import type { FinancePending } from '@/db/schema'
import { category } from '@/lib/finances/categories'
import { formatMoney } from '@/lib/finances/money'
import { cn } from '@/lib/utils'
import {
  acceptPendingCharge,
  financesQueryOptions,
  skipPendingCharge,
} from '@/server/finances.functions'
import { parseDay } from './pickers'

/** Recurring expenses / income that fell due and wait for the user:
 * Accept adds it as an entry on its day, Skip drops it. Nothing recurring
 * is counted until accepted. */
export function PendingList({
  pending,
  today,
}: {
  pending: Array<FinancePending>
  today: string
}) {
  const queryClient = useQueryClient()
  const act = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) =>
      accept
        ? acceptPendingCharge({ data: { id } }).then(() => undefined)
        : skipPendingCharge({ data: { id } }),
    onSuccess: async (_, { accept }) => {
      await queryClient.invalidateQueries(financesQueryOptions)
      toast.add({ title: accept ? 'Accepted' : 'Skipped', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't do that",
        description: error.message,
        type: 'error',
      }),
  })

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        To accept ({pending.length})
      </h2>
      <ItemGroup className="gap-2">
        {pending.map((p) => {
          const busy = act.isPending && act.variables.id === p.id
          return (
            <Item key={p.id} variant="outline" size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full truncate">
                  {p.title || category(p.category).label}
                </ItemTitle>
                <ItemDescription>
                  {p.day === today
                    ? 'Today'
                    : format(parseDay(p.day), 'EEE d MMM')}
                  {' · '}
                  {category(p.category).label}
                </ItemDescription>
              </ItemContent>
              <span
                className={cn(
                  'tabular-nums',
                  p.kind === 'income' && 'text-success',
                )}
              >
                {p.kind === 'income' ? '+' : '−'}
                {formatMoney(p.cents, p.currency)}
              </span>
              <ItemActions>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => act.mutate({ id: p.id, accept: false })}
                >
                  <XIcon data-icon="inline-start" />
                  Skip
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => act.mutate({ id: p.id, accept: true })}
                >
                  <CheckIcon data-icon="inline-start" />
                  Accept
                </Button>
              </ItemActions>
            </Item>
          )
        })}
      </ItemGroup>
    </section>
  )
}
