import { useMutation, useQueryClient } from '@tanstack/react-query'

import { notesTreeQueryOptions, viewNote } from '@/server/notes.functions'

// Counts a note as opened (feeds "Recent" / "Most viewed"). Applied to the
// cache straight away; a failure just means the count is a bit behind.
export function useViewNote() {
  const queryClient = useQueryClient()
  const { queryKey } = notesTreeQueryOptions

  const mutation = useMutation({
    mutationFn: (id: number) => viewNote({ data: { id } }),
    onMutate: (id) => {
      const previous = queryClient.getQueryData(queryKey)
      if (!previous) return
      queryClient.setQueryData(queryKey, {
        ...previous,
        notes: previous.notes.map((n) =>
          n.id === id
            ? { ...n, viewCount: n.viewCount + 1, openedAt: new Date() }
            : n,
        ),
      })
    },
  })

  return mutation.mutate
}
