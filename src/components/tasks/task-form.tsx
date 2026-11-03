import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import type { Task } from '@/db/schema'
import { taskInput } from '@/lib/tasks/schemas'
import type { TaskInput } from '@/lib/tasks/schemas'
import { todayName } from '@/lib/tasks/tree'
import type { FolderOption } from '@/lib/tasks/tree'
import {
  createTask,
  tasksTreeQueryOptions,
  updateTask,
} from '@/server/tasks.functions'
import { FolderSelect } from './folder-select'

// Kept short on purpose: type the task, Enter, done. The folder and the
// description are optional extras (Ctrl+Enter saves from the description).
export function TaskForm({
  task,
  folderId,
  folderOptions,
  onDone,
}: {
  task?: Task
  folderId: TaskInput['folderId']
  folderOptions: Array<FolderOption>
  /** Called with the saved task's id. */
  onDone: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async (value: TaskInput) => {
      const data = { ...value, today: todayName() }
      if (task) {
        await updateTask({ data: { id: task.id, ...data } })
        return task.id
      }
      return (await createTask({ data })).id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries(tasksTreeQueryOptions)
      toast.add({
        title: task ? 'Task updated' : 'Task added',
        type: 'success',
      })
      onDone(id)
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save task",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      folderId: task ? task.folderId : folderId,
    },
    validators: { onSubmit: taskInput },
    onSubmit: ({ value }) => save.mutateAsync(value),
  })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field
          name="title"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Task</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoFocus
                  autoComplete="off"
                  placeholder="What needs doing?"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="folderId"
          children={(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Folder</FieldLabel>
              <FolderSelect
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                options={folderOptions}
                withToday
              />
            </Field>
          )}
        />
        <form.Field
          name="description"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  rows={3}
                  placeholder="Optional details"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      void form.handleSubmit()
                    }
                  }}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {task ? 'Save' : 'Add task'}
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
