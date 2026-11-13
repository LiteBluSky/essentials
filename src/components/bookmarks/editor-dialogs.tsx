import { useMutation, useQueryClient } from '@tanstack/react-query'

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import { flattenFolders } from '@/lib/bookmarks/tree'
import type { FolderNode, Tree } from '@/lib/bookmarks/tree'
import {
  deleteFolder,
  deleteLink,
  bookmarksBinQueryOptions,
  bookmarksTreeQueryOptions,
} from '@/server/bookmarks.functions'
import type { EditorState } from './editor'
import { FolderForm } from './folder-form'
import { LinkForm } from './link-form'

// `state` is kept around after closing (only `open` flips) so the dialog
// content doesn't blank out during its exit animation.
export function EditorDialogs({
  tree,
  state,
  open,
  onOpenChange,
}: {
  tree: Tree
  state: EditorState | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const close = () => onOpenChange(false)
  const isForm = state?.kind === 'link' || state?.kind === 'folder'
  const isDelete =
    state?.kind === 'delete-link' || state?.kind === 'delete-folder'

  return (
    <>
      <Dialog open={open && isForm} onOpenChange={onOpenChange}>
        <DialogContent>
          {state?.kind === 'link' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.link ? 'Edit link' : 'New link'}
                </DialogTitle>
              </DialogHeader>
              <LinkForm
                link={state.link}
                folderId={state.folderId}
                folderOptions={flattenFolders(tree)}
                onDone={close}
              />
            </>
          )}
          {state?.kind === 'folder' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.folder ? 'Edit folder' : 'New folder'}
                </DialogTitle>
              </DialogHeader>
              <FolderForm
                folder={state.folder}
                parentId={state.parentId}
                folderOptions={flattenFolders(tree, state.folder?.id)}
                onDone={close}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={open && isDelete} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {isDelete && <DeleteConfirm state={state} onDone={close} />}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function countFolders(node: FolderNode): number {
  return node.folders.reduce((n, f) => n + 1 + countFolders(f), 0)
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function DeleteConfirm({
  state,
  onDone,
}: {
  state: Extract<EditorState, { kind: 'delete-link' | 'delete-folder' }>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () =>
      state.kind === 'delete-link'
        ? deleteLink({ data: { id: state.link.id } })
        : deleteFolder({ data: { id: state.node.folder.id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(bookmarksTreeQueryOptions),
        queryClient.invalidateQueries(bookmarksBinQueryOptions),
      ])
      toast.add({
        title: 'Moved to the bin',
        description: 'Restore it from the ⋮ menu within a day.',
        type: 'success',
      })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })
  useConfirmKey('d', () => {
    if (!remove.isPending) remove.mutate()
  })

  let title: string
  let description: string
  if (state.kind === 'delete-link') {
    title = `Delete “${state.link.title}”?`
    description = 'It goes to the bin (⋮ menu) for a day, then it’s gone.'
  } else {
    const subfolders = countFolders(state.node)
    const links = state.node.linkCount
    title = `Delete “${state.node.folder.name}”?`
    description =
      subfolders || links
        ? `This also deletes ${[
            subfolders && plural(subfolders, 'subfolder'),
            links && plural(links, 'link'),
          ]
            .filter(Boolean)
            .join(' and ')} inside it. The links go to the bin for a day.`
        : 'The folder is empty.'
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending && <Spinner data-icon="inline-start" />}
          Delete
          <Kbd className="max-lg:hidden">d</Kbd>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
