import { useMutation, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/components/ui/toast'
import { undoAssistantRun } from '@/server/assistant.functions'

/** Every query that shows something the assistant may have changed. */
const AFFECTED = [
  ['bookmarks'],
  ['notes'],
  ['tasks'],
  ['contacts'],
  ['calendar'],
  ['finances'],
  ['chat'],
  ['assistant', 'history'],
]

/**
 * Undo for an assistant run (a Tell me request or a chat turn): puts back
 * everything it created, changed or deleted, then refreshes every app.
 */
export function useUndoRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => undoAssistantRun({ data: { runId } }),
    onSuccess: async ({ undone, skipped }) => {
      await Promise.all(
        AFFECTED.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      toast.add({
        title: skipped.length
          ? `Undid ${undone} change${undone === 1 ? '' : 's'}, ${skipped.length} couldn't be`
          : `Undid ${undone} change${undone === 1 ? '' : 's'}`,
        description: skipped.join('\n') || undefined,
        type: skipped.length ? 'warning' : 'success',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't undo",
        description: error.message,
        type: 'error',
      }),
  })
}
