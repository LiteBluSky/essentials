import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CircleAlertIcon, Trash2Icon, Undo2Icon } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { useUndoRun } from '@/hooks/use-undo-run'
import {
  assistantHistoryQueryOptions,
  clearAssistantHistory,
} from '@/server/assistant.functions'

/** "$0.0031", "$1.24"; "—" when unknown. */
export function formatCost(usd: number | null) {
  if (usd === null) return '—'
  if (usd === 0) return '$0'
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function formatTokens(n: number | null) {
  if (n === null) return '—'
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString()
}

/**
 * Assistant history (every app's ⋮ menu): each "Tell me…" request, what came
 * of it (or the error), the model, tokens and cost, newest first, with the
 * totals over all requests. Cost is what the provider reports (OpenRouter)
 * or worked out from Anthropic's prices; "—" when unknown.
 */
export function AssistantHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const undo = useUndoRun()
  const history = useQuery({ ...assistantHistoryQueryOptions, enabled: open })
  const clear = useMutation({
    mutationFn: () => clearAssistantHistory(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(assistantHistoryQueryOptions)
      toast.add({ title: 'History cleared', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't clear the history",
        description: error.message,
        type: 'error',
      }),
  })

  const data = history.data
  const totals = data?.totals

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Assistant history</DialogTitle>
          <DialogDescription>
            {totals && totals.requests > 0
              ? `${totals.requests} request${totals.requests === 1 ? '' : 's'} · ${formatCost(totals.costUsd)} in total · ${formatTokens(totals.inputTokens)} in / ${formatTokens(totals.outputTokens)} out tokens${totals.unpriced ? ` · ${totals.unpriced} without a known cost` : ''}`
              : 'What you asked the “Tell me…” field, and what it cost.'}
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          history.error ? (
            <p className="text-sm text-destructive">{history.error.message}</p>
          ) : (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )
        ) : data.entries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nothing yet</EmptyTitle>
              <EmptyDescription>
                Requests to the “Tell me…” field show up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>You said</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => (
                  <TableRow key={entry.id} className="align-top">
                    <TableCell className="text-muted-foreground tabular-nums">
                      {format(entry.createdAt, 'd MMM HH:mm')}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal break-words">
                      {entry.text}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-pre-line break-words">
                      {entry.ok ? (
                        entry.result
                      ) : (
                        <span className="flex gap-1.5 text-destructive">
                          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
                          {entry.result}
                        </span>
                      )}
                      {entry.runId &&
                        (entry.undoable ? (
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-1.5 flex"
                            disabled={undo.isPending}
                            onClick={() =>
                              entry.runId && undo.mutate(entry.runId)
                            }
                          >
                            <Undo2Icon data-icon="inline-start" />
                            Undo changes
                          </Button>
                        ) : (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Changes undone
                          </span>
                        ))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.model || '—'}
                      <span className="block text-xs">
                        {(entry.durationMs / 1000).toFixed(1)} s
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.inputTokens === null
                        ? '—'
                        : `${formatTokens(entry.inputTokens)} / ${formatTokens(entry.outputTokens)}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCost(entry.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Tokens are in / out. Showing the latest {data.entries.length}.
              </p>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="outline" disabled={clear.isPending} />
                  }
                >
                  <Trash2Icon data-icon="inline-start" />
                  Clear history
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear the history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every logged request and its cost is deleted. What the
                      assistant created stays.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => clear.mutate()}
                    >
                      Clear
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
