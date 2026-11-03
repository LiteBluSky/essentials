import { useMutation, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/components/ui/toast'
import type { CompleteInput } from '@/lib/tasks/schemas'
import { completeTask, tasksTreeQueryOptions } from '@/server/tasks.functions'

// Ticks a task off (or reopens it), applied to the cache straight away.
// Returns `toggle(id)`, which flips the task's current state.
export function useCompleteTask() {
  const queryClient = useQueryClient()
  const { queryKey } = tasksTreeQueryOptions

  const mutation = useMutation({
    mutationFn: (input: CompleteInput) => completeTask({ data: input }),
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      if (previous) {
        queryClient.setQueryData(queryKey, {
          ...previous,
          tasks: previous.tasks.map((t) =>
            t.id === id ? { ...t, completedAt: done ? new Date() : null } : t,
          ),
        })
      }
      return { previous }
    },
    onSuccess: (_data, { id, done }) => {
      toast.add({
        title: done ? 'Task completed' : 'Task reopened',
        type: 'success',
        actionProps: {
          children: 'Undo',
          onClick: () => mutation.mutate({ id, done: !done }),
        },
      })
    },
    onError: (error, _input, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous)
      toast.add({
        title: "Couldn't update the task",
        description: error.message,
        type: 'error',
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (id: number) => {
    const task = queryClient
      .getQueryData(queryKey)
      ?.tasks.find((t) => t.id === id)
    if (task) mutation.mutate({ id, done: task.completedAt === null })
  }
}
