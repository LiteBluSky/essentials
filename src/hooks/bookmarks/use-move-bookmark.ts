import { useMutation, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/components/ui/toast'
import type { MoveInput } from '@/lib/bookmarks/schemas'
import { reorderIds } from '@/lib/bookmarks/tree'
import {
  moveBookmark,
  bookmarksTreeQueryOptions,
} from '@/server/bookmarks.functions'
import type { getTree } from '@/server/bookmarks.functions'

type TreeData = Awaited<ReturnType<typeof getTree>>

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
  const siblings = data.links
    .filter((l) => l.folderId === move.parentId && l.id !== move.id)
    .map((l) => l.id)
  const order = reorderIds(siblings, move.id, move.index)
  const links = data.links
    .map((l) => {
      const position = order.indexOf(l.id)
      if (position === -1) return l
      return { ...l, position, folderId: move.parentId }
    })
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
  return { ...data, links }
}

export function useMoveBookmark() {
  const queryClient = useQueryClient()
  const { queryKey } = bookmarksTreeQueryOptions

  return useMutation({
    mutationFn: (move: MoveInput) => moveBookmark({ data: move }),
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
