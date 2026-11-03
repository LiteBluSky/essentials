import { useMutation, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/components/ui/toast'
import { MAX_FAVORITES } from '@/lib/bookmarks/schemas'
import type { FavoriteInput } from '@/lib/bookmarks/schemas'
import {
  favoriteLink,
  bookmarksTreeQueryOptions,
} from '@/server/bookmarks.functions'

// Adds/removes a favourite (menu item, `f`, the star in the favourites list).
// Applied optimistically; the server enforces the limit too.
export function useFavorite() {
  const queryClient = useQueryClient()
  const { queryKey } = bookmarksTreeQueryOptions

  const mutation = useMutation({
    mutationFn: (input: FavoriteInput) => favoriteLink({ data: input }),
    onMutate: async ({ id, favorite }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      if (previous) {
        const last = Math.max(
          -1,
          ...previous.links.map((l) => l.favoritePosition ?? -1),
        )
        queryClient.setQueryData(queryKey, {
          ...previous,
          links: previous.links.map((l) =>
            l.id === id
              ? { ...l, favoritePosition: favorite ? last + 1 : null }
              : l,
          ),
        })
      }
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous)
      toast.add({
        title: "Couldn't update favourites",
        description: error.message,
        type: 'error',
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  /** Flips the link's favourite state (no-op with a toast when full). */
  const toggle = (linkId: number) => {
    const links = queryClient.getQueryData(queryKey)?.links ?? []
    const link = links.find((l) => l.id === linkId)
    if (!link) return
    const favorite = link.favoritePosition === null
    if (
      favorite &&
      links.filter((l) => l.favoritePosition !== null).length >= MAX_FAVORITES
    ) {
      toast.add({
        title: `You can have up to ${MAX_FAVORITES} favourites`,
        description: 'Remove one first.',
        type: 'error',
      })
      return
    }
    mutation.mutate({ id: linkId, favorite })
    toast.add({
      title: favorite
        ? `Added “${link.title}” to favourites`
        : `Removed “${link.title}” from favourites`,
      type: 'success',
    })
  }

  return toggle
}
