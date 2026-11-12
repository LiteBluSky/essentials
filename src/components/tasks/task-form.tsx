import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { XIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { ReferenceAutocomplete } from '@/components/reference-autocomplete'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import type { Task } from '@/db/schema'
import { taskInput } from '@/lib/tasks/schemas'
import type { TaskInput } from '@/lib/tasks/schemas'
import { DEFAULT_DUE_HOUR, REMIND_OPTIONS } from '@/lib/tasks/tree'
import type { FolderOption } from '@/lib/tasks/tree'
import {
  createTask,
  tasksTreeQueryOptions,
  updateTask,
} from '@/server/tasks.functions'
import { DatePicker } from './date-picker'
import { FolderSelect } from './folder-select'

// The form's own fields; the due date (a day + a time) and its reminder are
// kept beside it.
const formInput = taskInput.omit({ dueAt: true, remindMinutes: true })
type FormInput = Omit<TaskInput, 'dueAt' | 'remindMinutes'>

// Kept short on purpose: type the task, Enter, done. The folder, the due date
// and the description are optional extras (Ctrl+Enter saves from the
// description).
export function TaskForm({
  task,
  folderId,
  date: initialDate,
  folderOptions,
  onDone,
}: {
  task?: Task
  folderId: TaskInput['folderId']
  /** A new task's due day (from the calendar); none when unset. */
  date?: Date
  folderOptions: Array<FolderOption>
  /** Called with the saved task's id. */
  onDone: (id: number) => void
}) {
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()
  // Due: a day (none = not due) and an optional time (else 09:00).
  const [dueDay, setDueDay] = useState<Date | null>(
    () => task?.dueAt ?? initialDate ?? null,
  )
  const [dueTime, setDueTime] = useState(() =>
    task?.dueAt ? format(task.dueAt, 'HH:mm') : '',
  )
  // Minutes before the due time to remind (null = no reminder).
  const [remind, setRemind] = useState<number | null>(() =>
    task ? task.remindMinutes : 0,
  )
  const save = useMutation({
    mutationFn: async (value: FormInput) => {
      const dueAt = dueDay ? atTime(dueDay, dueTime) : null
      const data = { ...value, dueAt, remindMinutes: remind }
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
    validators: { onSubmit: formInput },
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
              />
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor="task-due">Due</FieldLabel>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <DatePicker
                id="task-due"
                value={dueDay}
                onChange={setDueDay}
                placeholder="No due date"
              />
            </div>
            {dueDay && (
              <>
                <Input
                  type="time"
                  aria-label="Due time"
                  title={`Due time (${DEFAULT_DUE_HOUR}:00 when empty)`}
                  className="w-28"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="No due date"
                  title="No due date"
                  onClick={() => {
                    setDueDay(null)
                    setDueTime('')
                  }}
                >
                  <XIcon />
                </Button>
              </>
            )}
          </div>
        </Field>
        {dueDay && (
          <Field>
            <FieldLabel htmlFor="task-remind">Remind</FieldLabel>
            <Select
              items={REMIND_OPTIONS}
              value={remind}
              onValueChange={(value) => setRemind(value)}
            >
              <SelectTrigger id="task-remind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {REMIND_OPTIONS.map((option) => (
                    <SelectItem key={option.label} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
        <form.Field
          name="description"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                <Textarea
                  ref={descriptionRef}
                  id={field.name}
                  name={field.name}
                  rows={3}
                  placeholder="Optional details (@ links to anything)"
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
                <ReferenceAutocomplete target={descriptionRef} />
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

/** `day` at `time` (`HH:mm`), or at DEFAULT_DUE_HOUR when it's empty. */
function atTime(day: Date, time: string) {
  const [hours, minutes] = time
    ? time.split(':').map(Number)
    : [DEFAULT_DUE_HOUR, 0]
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
  )
}
