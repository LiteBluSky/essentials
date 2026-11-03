import { useMutation, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/components/ui/toast'
import type { MoveInput } from '@/lib/tasks/schemas'
import { reorderIds } from '@/lib/tasks/tree'
import { moveTreeItem, tasksTreeQueryOptions } from '@/server/tasks.functions'
import type { TreeData } from '@/server/tasks.functions'

// Mirrors the server's reorder on the cached rows so drops feel instant.
function applyMove(data: TreeData, move: MoveInput): TreeData {
  if (move.kind === 'folder') {
    const siblings = data.folders
      .filter((f) => f.parentId === move.parentId && f.id !== move.id)
      .map((f) => f.id)
    const order = reorderIds(siblings, move.id, move.index)
    const folders = data.folders
      .map((f) => {
        const position = order.indexOf(f.id)
        if (position === -1) return f
        return { ...f, position, parentId: move.parentId }
      })
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    return { ...data, folders }
  }
  const siblings = data.tasks
    .filter((n) => n.folderId === move.parentId && n.id !== move.id)
    .map((n) => n.id)
  const order = reorderIds(siblings, move.id, move.index)
  const tasks = data.tasks
    .map((n) => {
      const position = order.indexOf(n.id)
      if (position === -1) return n
      return { ...n, position, folderId: move.parentId }
    })
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
  return { ...data, tasks }
}

export function useMoveItem() {
  const queryClient = useQueryClient()
  const { queryKey } = tasksTreeQueryOptions

  return useMutation({
    mutationFn: (move: MoveInput) => moveTreeItem({ data: move }),
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      if (previous)
        queryClient.setQueryData(queryKey, applyMove(previous, move))
      return { previous }
    },
    onError: (error, _move, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous)
      toast.add({
        title: "Couldn't move",
        description: error.message,
        type: 'error',
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}
