import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CopyIcon, FileDownIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useRef } from 'react'

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import type { Note } from '@/db/schema'
import { toggleTaskAt } from '@/lib/notes/markdown-edit'
import { flattenFolders, folderPath, noteLabel } from '@/lib/notes/tree'
import type { FolderNode, Tree } from '@/lib/notes/tree'
import { cn } from '@/lib/utils'
import {
  deleteFolder,
  deleteNote,
  notesBinQueryOptions,
  notesTreeQueryOptions,
  updateNote,
} from '@/server/notes.functions'
import type { EditorState, OpenEditor } from './editor'
import { FolderForm } from './folder-form'
import { Markdown } from './markdown'
import { NoteForm } from './note-form'
import { usePrintNote } from './note-print'

// `state` is kept around after closing (only `open` flips) so the dialog
// content doesn't blank out during its exit animation.
export function EditorDialogs({
  tree,
  notes,
  state,
  open,
  onOpenChange,
  onChange,
}: {
  tree: Tree
  notes: Array<Note>
  state: EditorState | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Switch what the dialog shows (preview ⇄ edit, delete confirm). */
  onChange: OpenEditor
}) {
  const close = () => onOpenChange(false)
  // Set by the note form: saves (if needed) before the dialog closes.
  const saveAndClose = useRef<(() => Promise<void>) | null>(null)
  const isNote = state?.kind === 'note'
  const isForm = isNote || state?.kind === 'folder'
  const isDelete =
    state?.kind === 'delete-note' || state?.kind === 'delete-folder'
  const viewed =
    state?.kind === 'note' && state.mode === 'view'
      ? notes.find((n) => n.id === state.noteId)
      : undefined

  return (
    <>
      <Dialog
        open={open && isForm}
        onOpenChange={(next) => {
          // Esc / click outside while writing saves instead of discarding.
          if (!next && saveAndClose.current) void saveAndClose.current()
          else onOpenChange(next)
        }}
      >
        <DialogContent
          className={cn(
            isNote && 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl',
          )}
        >
          {state?.kind === 'note' && state.mode === 'view' && (
            <NoteView
              note={viewed}
              path={viewed ? folderPath(tree, viewed.folderId) : []}
              onEdit={(note) =>
                onChange({
                  kind: 'note',
                  mode: 'edit',
                  note,
                  folderId: note.folderId,
                })
              }
              onDelete={(note) => onChange({ kind: 'delete-note', note })}
            />
          )}
          {state?.kind === 'note' && state.mode === 'edit' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.note ? 'Edit note' : 'New note'}
                </DialogTitle>
              </DialogHeader>
              <NoteForm
                // Fresh form state for each note.
                key={state.note?.id ?? 'new'}
                note={state.note}
                folderId={state.folderId}
                folderOptions={flattenFolders(tree)}
                closeRef={saveAndClose}
                onDone={(then, id) => {
                  if (then === 'view' && id !== null) {
                    onChange({ kind: 'note', mode: 'view', noteId: id })
                  } else close()
                }}
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

const edited = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// The note's preview: title large, a gap, then the rendered markdown. Task
// boxes can be ticked right here. `e` edits, `d` deletes, Ctrl+P exports it
// as a PDF.
function NoteView({
  note,
  path,
  onEdit,
  onDelete,
}: {
  note: Note | undefined
  path: Array<string>
  onEdit: (note: Note) => void
  onDelete: (note: Note) => void
}) {
  const queryClient = useQueryClient()
  const { queryKey } = notesTreeQueryOptions
  const [printNote, printElement] = usePrintNote()
  const toggleTask = useMutation({
    mutationFn: (next: Note) =>
      updateNote({
        data: {
          id: next.id,
          title: next.title,
          body: next.body,
          folderId: next.folderId,
        },
      }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      if (previous) {
        queryClient.setQueryData(queryKey, {
          ...previous,
          notes: previous.notes.map((n) => (n.id === next.id ? next : n)),
        })
      }
      return { previous }
    },
    onError: (error, _next, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous)
      toast.add({
        title: "Couldn't update the checklist",
        description: error.message,
        type: 'error',
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  if (!note) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Note not found</EmptyTitle>
          <EmptyDescription>It may have been deleted.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.body)
      toast.add({ title: 'Text copied', type: 'success' })
    } catch {
      toast.add({ title: "Couldn't copy text", type: 'error' })
    }
  }

  return (
    <div
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
          e.preventDefault()
          printNote(note, path)
          return
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return
        if ((e.target as Element).closest('input, textarea')) return
        if (e.key === 'e' || e.key === 'r') {
          e.preventDefault()
          onEdit(note)
        } else if (e.key === 'd') {
          e.preventDefault()
          onDelete(note)
        }
      }}
    >
      <DialogHeader className="gap-1 pr-8">
        <DialogDescription>
          {[...path, `Edited ${edited.format(note.updatedAt)}`].join(' / ')}
        </DialogDescription>
        <DialogTitle
          className={cn(
            note.title ? 'text-2xl leading-tight font-semibold' : 'sr-only',
          )}
        >
          {noteLabel(note)}
        </DialogTitle>
      </DialogHeader>

      {note.body.trim() ? (
        <Markdown
          onToggleTask={(offset) => {
            const body = toggleTaskAt(note.body, offset)
            if (body !== null) toggleTask.mutate({ ...note, body })
          }}
        >
          {note.body}
        </Markdown>
      ) : (
        <p className="text-muted-foreground">
          Nothing written yet. Press <Kbd>e</Kbd> to start.
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onDelete(note)}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
        <Button variant="outline" onClick={copy} disabled={!note.body}>
          <CopyIcon data-icon="inline-start" />
          Copy text
        </Button>
        <Button variant="outline" onClick={() => printNote(note, path)}>
          <FileDownIcon data-icon="inline-start" />
          Export PDF
        </Button>
        {/* Focused on open so e / d / Esc work straight away. */}
        <Button autoFocus onClick={() => onEdit(note)}>
          <PencilIcon data-icon="inline-start" />
          Edit
          <Kbd className="max-sm:hidden">E</Kbd>
        </Button>
      </DialogFooter>
      {printElement}
    </div>
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
  state: Extract<EditorState, { kind: 'delete-note' | 'delete-folder' }>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () =>
      state.kind === 'delete-note'
        ? deleteNote({ data: { id: state.note.id } })
        : deleteFolder({ data: { id: state.node.folder.id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(notesTreeQueryOptions),
        queryClient.invalidateQueries(notesBinQueryOptions),
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

  let title: string
  let description: string
  if (state.kind === 'delete-note') {
    title = `Delete “${noteLabel(state.note)}”?`
    description = 'It goes to the bin (⋮ menu) for a day, then it’s gone.'
  } else {
    const subfolders = countFolders(state.node)
    const notes = state.node.noteCount
    title = `Delete “${state.node.folder.name}”?`
    description =
      subfolders || notes
        ? `This also deletes ${[
            subfolders && plural(subfolders, 'subfolder'),
            notes && plural(notes, 'note'),
          ]
            .filter(Boolean)
            .join(' and ')} inside it. The notes go to the bin for a day.`
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
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
