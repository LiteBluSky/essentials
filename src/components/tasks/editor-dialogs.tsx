import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CircleCheckIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'

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
import { useConfirmKey } from '@/hooks/use-confirm-key'
import type { Task } from '@/db/schema'
import { flattenFolders, folderPath } from '@/lib/tasks/tree'
import type { FolderNode, Tree } from '@/lib/tasks/tree'
import {
  deleteFolder,
  deleteTask,
  tasksTreeQueryOptions,
} from '@/server/tasks.functions'
import type { EditorState, OpenEditor } from './editor'
import { FolderForm } from './folder-form'
import { TaskAge, TaskCheck } from './task-tree'
import { TaskForm } from './task-form'

// `state` is kept around after closing (only `open` flips) so the dialog
// content doesn't blank out during its exit animation.
export function EditorDialogs({
  tree,
  tasks,
  state,
  open,
  onOpenChange,
  onChange,
  onComplete,
  onSaved,
}: {
  tree: Tree
  tasks: Array<Task>
  state: EditorState | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Switch what the dialog shows (details ⇄ edit, delete confirm). */
  onChange: OpenEditor
  onComplete: (taskId: number) => void
  /** A task was created or saved (e.g. to reveal it in the tree). */
  onSaved: (taskId: number) => void
}) {
  const close = () => onOpenChange(false)
  const isForm = state?.kind === 'task' || state?.kind === 'folder'
  const isDelete =
    state?.kind === 'delete-task' || state?.kind === 'delete-folder'
  const viewed =
    state?.kind === 'task' && state.mode === 'view'
      ? tasks.find((t) => t.id === state.taskId)
      : undefined

  return (
    <>
      <Dialog open={open && isForm} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {state?.kind === 'task' && state.mode === 'view' && (
            <TaskView
              task={viewed}
              path={viewed ? folderPath(tree, viewed.folderId) : []}
              onComplete={onComplete}
              onEdit={(task) =>
                onChange({
                  kind: 'task',
                  mode: 'edit',
                  task,
                  folderId: task.folderId,
                })
              }
              onDelete={(task) => onChange({ kind: 'delete-task', task })}
            />
          )}
          {state?.kind === 'task' && state.mode === 'edit' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.task ? 'Edit task' : 'New task'}
                </DialogTitle>
              </DialogHeader>
              <TaskForm
                // Fresh form state for each task.
                key={state.task?.id ?? 'new'}
                task={state.task}
                folderId={state.folderId}
                date={state.date}
                folderOptions={flattenFolders(tree)}
                onDone={(id) => {
                  onSaved(id)
                  // Editing goes back to the details; a new task just closes
                  // (ready for the next one).
                  if (state.task) {
                    onChange({ kind: 'task', mode: 'view', taskId: id })
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

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// A task's details: folder path, the title large, its age, the description.
// `e` edits, `c` completes / reopens, `d` deletes.
function TaskView({
  task,
  path,
  onComplete,
  onEdit,
  onDelete,
}: {
  task: Task | undefined
  path: Array<string>
  onComplete: (taskId: number) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  if (!task) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Task not found</EmptyTitle>
          <EmptyDescription>It may have been deleted.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const done = task.completedAt !== null

  return (
    <div
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        if ((e.target as Element).closest('input, textarea')) return
        if (e.key === 'e' || e.key === 'r') {
          e.preventDefault()
          onEdit(task)
        } else if (e.key === 'c') {
          e.preventDefault()
          onComplete(task.id)
        } else if (e.key === 'd' || e.key === 'Delete') {
          e.preventDefault()
          onDelete(task)
        }
      }}
    >
      <DialogHeader className="gap-1 pr-8">
        <DialogDescription>
          {path.length ? path.join(' / ') : 'Top level'}
        </DialogDescription>
        <div className="flex items-start gap-1">
          <TaskCheck task={task} onComplete={onComplete} />
          <DialogTitle className="text-xl leading-tight font-semibold">
            {task.title}
          </DialogTitle>
        </div>
      </DialogHeader>

      {task.description.trim() ? (
        <p className="break-words whitespace-pre-wrap">{task.description}</p>
      ) : (
        <p className="text-muted-foreground">
          No description. Press <Kbd>e</Kbd> to add one.
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {task.dueAt && (
          <>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="flex items-center gap-2">
              {dateTime.format(task.dueAt)}
              {!done && <TaskAge task={task} />}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Created</dt>
        <dd className="flex items-center gap-2">
          {dateTime.format(task.createdAt)}
          {!done && !task.dueAt && <TaskAge task={task} />}
        </dd>
        {task.completedAt && (
          <>
            <dt className="text-muted-foreground">Completed</dt>
            <dd>{dateTime.format(task.completedAt)}</dd>
          </>
        )}
      </dl>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onDelete(task)}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
        <Button variant="outline" onClick={() => onEdit(task)}>
          <PencilIcon data-icon="inline-start" />
          Edit
          <Kbd className="max-sm:hidden">E</Kbd>
        </Button>
        {/* Focused on open so c / e / Esc work straight away. */}
        <Button autoFocus onClick={() => onComplete(task.id)}>
          {done ? (
            <RotateCcwIcon data-icon="inline-start" />
          ) : (
            <CircleCheckIcon data-icon="inline-start" />
          )}
          {done ? 'Reopen' : 'Complete'}
          <Kbd className="max-sm:hidden">C</Kbd>
        </Button>
      </DialogFooter>
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
  state: Extract<EditorState, { kind: 'delete-task' | 'delete-folder' }>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () =>
      state.kind === 'delete-task'
        ? deleteTask({ data: { id: state.task.id } })
        : deleteFolder({ data: { id: state.node.folder.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(tasksTreeQueryOptions)
      toast.add({ title: 'Deleted', type: 'success' })
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
  if (state.kind === 'delete-task') {
    title = `Delete “${state.task.title}”?`
    description = 'The task will be removed permanently.'
  } else {
    const subfolders = countFolders(state.node)
    const tasks = state.node.taskCount
    title = `Delete “${state.node.folder.name}”?`
    description =
      subfolders || tasks
        ? `This also deletes ${[
            subfolders && plural(subfolders, 'subfolder'),
            tasks && plural(tasks, 'task'),
          ]
            .filter(Boolean)
            .join(' and ')} inside it.`
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
          <Kbd className="max-sm:hidden">d</Kbd>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
