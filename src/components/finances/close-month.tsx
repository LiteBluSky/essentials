import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LockIcon } from 'lucide-react'

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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { toast } from '@/components/ui/toast'
import { monthLabel } from '@/lib/finances/money'
import {
  closeFinanceMonth,
  financesQueryOptions,
} from '@/server/finances.functions'

/** A past month still open: until it's closed nothing can be added to the
 * current month. Closing (confirmed) keeps only its totals. */
export function CloseMonth({
  month,
  waiting,
  onShow,
  confirming,
  onConfirmingChange: setConfirming,
}: {
  month: string
  /** Its recurring charges still waiting to be accepted. */
  waiting: number
  /** Shows that month. */
  onShow: () => void
  /** The confirmation is open (the page's keys are off meanwhile). */
  confirming: boolean
  onConfirmingChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const close = useMutation({
    mutationFn: () => closeFinanceMonth(),
    onSuccess: async ({ month: closed }) => {
      await queryClient.invalidateQueries(financesQueryOptions)
      setConfirming(false)
      toast.add({ title: `${monthLabel(closed)} closed`, type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't close it",
        description: error.message,
        type: 'error',
      }),
  })
  const label = monthLabel(month)

  return (
    <>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <LockIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Close {label}</ItemTitle>
          <ItemDescription>
            {waiting > 0
              ? `Accept or skip its ${waiting} recurring ${waiting === 1 ? 'charge' : 'charges'}, then close it. `
              : ''}
            Until it's closed, new entries go on its last day and nothing can be
            added to this month.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm" onClick={onShow}>
            Show it
          </Button>
          <Button
            size="sm"
            disabled={waiting > 0}
            onClick={() => setConfirming(true)}
          >
            Close {label}
          </Button>
        </ItemActions>
      </Item>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its entries are folded into its totals per category and can't be
              changed after; what it left carries into the next month.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={close.isPending}
              onClick={() => close.mutate()}
            >
              Close {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
