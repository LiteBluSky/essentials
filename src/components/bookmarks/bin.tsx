import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { BinDialog } from '@/components/bin-dialog'
import { toast } from '@/components/ui/toast'
import {
  bookmarksTreeQueryOptions,
  bookmarksBinQueryOptions,
  deleteFromBin,
  emptyBin,
  restoreFromBin,
} from '@/server/bookmarks.functions'

// The ⋮ menu's Bin: links deleted in the last day, restorable.
export function LinksBin({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const bin = useQuery({ ...bookmarksBinQueryOptions, enabled: open })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(bookmarksBinQueryOptions),
      queryClient.invalidateQueries(bookmarksTreeQueryOptions),
    ])
  const onError = (error: Error) =>
    toast.add({
      title: 'Something went wrong',
      description: error.message,
      type: 'error',
    })

  const restore = useMutation({
    mutationFn: (id: number) => restoreFromBin({ data: { id } }),
    onSuccess: async (_, id) => {
      const entry = bin.data?.find((e) => e.id === id)
      await refresh()
      toast.add({
        title: 'Restored',
        description: entry ? `“${entry.title}”` : undefined,
        type: 'success',
      })
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteFromBin({ data: { id } }),
    onSuccess: refresh,
    onError,
  })
  const empty = useMutation({
    mutationFn: () => emptyBin(),
    onSuccess: async () => {
      await refresh()
      toast.add({ title: 'Bin emptied', type: 'success' })
    },
    onError,
  })

  return (
    <BinDialog
      open={open}
      onOpenChange={onOpenChange}
      noun="link"
      entries={bin.data?.map((e) => ({
        id: e.id,
        label: e.title,
        path: e.folderPath,
        deletedAt: e.deletedAt,
      }))}
      busy={restore.isPending || remove.isPending || empty.isPending}
      onRestore={(id) => restore.mutate(id)}
      onDelete={(id) => remove.mutate(id)}
      onEmpty={() => empty.mutate()}
    />
  )
}
