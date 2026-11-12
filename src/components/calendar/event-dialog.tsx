import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'

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
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CalendarEvent } from '@/db/schema'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import {
  CALENDAR_COLORS,
  COLOR_KEYS,
  DEFAULT_COLOR,
} from '@/lib/calendar/colors'
import type { CalendarColor } from '@/lib/calendar/colors'
import { WEEK_STARTS_ON, isoDay, parseDay } from '@/lib/calendar/layout'
import { eventInput } from '@/lib/calendar/schemas'
import type { EventInput } from '@/lib/calendar/schemas'
import { cn } from '@/lib/utils'
import {
  calendarQueryOptions,
  createEvent,
  deleteEvent,
  updateEvent,
} from '@/server/calendar.functions'
import { sendDayKey } from './day-keys'

/** What the dialog is doing: a new strip over a range, or editing one. */
export type EventEditor =
  | { mode: 'new'; from: string; to: string }
  | { mode: 'edit'; event: CalendarEvent }

/** The colour swatches are 8 to a row: h/l step one, k/j a row. */
const COLOR_COLUMNS = 8
const COLOR_STEPS: Record<string, number | undefined> = {
  h: -1,
  l: 1,
  k: -COLOR_COLUMNS,
  j: COLOR_COLUMNS,
}

// The colour last used for a new strip (per browser).
const COLOR_KEY = 'calendar:color'

function lastColor(): CalendarColor {
  try {
    const stored = localStorage.getItem(COLOR_KEY)
    if (CALENDAR_COLORS.some((c) => c.key === stored)) {
      return stored as CalendarColor
    }
  } catch {
    // Storage blocked: the default.
  }
  return DEFAULT_COLOR
}

function rememberColor(color: CalendarColor) {
  try {
    localStorage.setItem(COLOR_KEY, color)
  } catch {
    // Not kept; fine.
  }
}

/** "Thu 12 Nov", or "Thu 12 – Sat 14 Nov 2026" for a range. */
export function rangeLabel(from: string, to: string) {
  const a = parseDay(from)
  if (from === to) return format(a, 'EEE d MMM yyyy')
  const b = parseDay(to)
  return `${format(a, a.getFullYear() === b.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy')} – ${format(b, 'EEE d MMM yyyy')}`
}

export function EventDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: EventEditor | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {editor && (
          <EventForm
            // A fresh form for each strip.
            key={editor.mode === 'edit' ? editor.event.id : 'new'}
            editor={editor}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EventForm({
  editor,
  onDone,
}: {
  editor: EventEditor
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const event = editor.mode === 'edit' ? editor.event : null
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = useMutation({
    mutationFn: async (value: EventInput) => {
      if (event) await updateEvent({ data: { id: event.id, ...value } })
      else await createEvent({ data: value })
    },
    onSuccess: async (_, value) => {
      if (!event) rememberColor(value.color)
      await queryClient.invalidateQueries(calendarQueryOptions)
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save",
        description: error.message,
        type: 'error',
      }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteEvent({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(calendarQueryOptions)
      setConfirmDelete(false)
      onDone()
      toast.add({ title: 'Deleted', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      title: event?.title ?? '',
      color: (event?.color as CalendarColor | undefined) ?? lastColor(),
      startDay: event?.startDay ?? (editor.mode === 'new' ? editor.from : ''),
      endDay: event?.endDay ?? (editor.mode === 'new' ? editor.to : ''),
    },
    validators: { onSubmit: eventInput },
    onSubmit: ({ value }) => save.mutateAsync(value),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{event ? 'Edit' : 'New'}</DialogTitle>
        <form.Subscribe
          selector={(s) => [s.values.startDay, s.values.endDay] as const}
          children={([from, to]) => (
            <DialogDescription>
              {from && to ? rangeLabel(from, to) : 'Pick a day'}
            </DialogDescription>
          )}
        />
      </DialogHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
        // Ctrl+Enter (⌘ on macOS) saves from anywhere in the form: the
        // swatches and the range picker included (caught before they see
        // the Enter).
        onKeyDownCapture={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
          e.preventDefault()
          e.stopPropagation()
          void form.handleSubmit()
        }}
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          <form.Field
            name="title"
            children={(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoFocus
                  autoComplete="off"
                  placeholder="Optional"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </Field>
            )}
          />
          <form.Field
            name="color"
            children={(field) => (
              <Field>
                <FieldLabel id="event-color">Colour</FieldLabel>
                <ToggleGroup
                  aria-labelledby="event-color"
                  spacing={1}
                  className="grid grid-cols-8"
                  // h/l previous / next colour, k/j the row above / below:
                  // picks it straight away (the arrows only move focus).
                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                    const step = COLOR_STEPS[e.key]
                    if (!step || e.ctrlKey || e.metaKey || e.altKey) return
                    e.preventDefault()
                    e.stopPropagation()
                    const i = COLOR_KEYS.indexOf(field.state.value)
                    const next =
                      COLOR_KEYS[
                        Math.min(Math.max(i + step, 0), COLOR_KEYS.length - 1)
                      ]
                    field.handleChange(next)
                    e.currentTarget
                      .querySelector<HTMLElement>(`[data-color="${next}"]`)
                      ?.focus()
                  }}
                  value={[field.state.value]}
                  onValueChange={(value: Array<string>) => {
                    const next = value.at(-1)
                    if (next) field.handleChange(next as CalendarColor)
                  }}
                >
                  {CALENDAR_COLORS.map((color) => (
                    <ToggleGroupItem
                      key={color.key}
                      value={color.key}
                      data-color={color.key}
                      size="sm"
                      aria-label={color.label}
                      title={color.label}
                    >
                      <span
                        className={cn('size-4 rounded-full', color.className)}
                      />
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
          />
          <form.Field
            name="endDay"
            children={(endField) => (
              <form.Field
                name="startDay"
                children={(startField) => {
                  const errors = [
                    ...startField.state.meta.errors,
                    ...endField.state.meta.errors,
                  ]
                  const from = startField.state.value
                  const to = endField.state.value
                  return (
                    <Field data-invalid={errors.length > 0}>
                      <FieldLabel>Days</FieldLabel>
                      {/* h/j/k/l move between days, m/M months (as the
                          arrows / PageDown / PageUp); Enter picks. */}
                      <div
                        className="w-fit"
                        onKeyDownCapture={(e) => {
                          if (e.ctrlKey || e.metaKey || e.altKey) return
                          if (sendDayKey(e.target, e.key)) {
                            e.preventDefault()
                            e.stopPropagation()
                          }
                        }}
                      >
                        <Calendar
                          mode="range"
                          weekStartsOn={WEEK_STARTS_ON}
                          defaultMonth={from ? parseDay(from) : undefined}
                          selected={
                            from
                              ? {
                                  from: parseDay(from),
                                  to: parseDay(to || from),
                                }
                              : undefined
                          }
                          onSelect={(range) => {
                            if (!range?.from) return
                            startField.handleChange(isoDay(range.from))
                            endField.handleChange(
                              isoDay(range.to ?? range.from),
                            )
                          }}
                          className="rounded-lg border"
                        />
                      </div>
                      <FieldDescription>
                        One day, or a first and a last day (click, or move with
                        h/j/k/l and press Enter).
                      </FieldDescription>
                      {errors.length > 0 && <FieldError errors={errors} />}
                    </Field>
                  )
                }}
              />
            )}
          />
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          {event ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  {event ? 'Save' : 'Add'}
                </Button>
              )}
            />
          </div>
        </DialogFooter>
      </form>
      {event && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            {confirmDelete && (
              <DeleteConfirm
                label={event.title}
                pending={remove.isPending}
                onConfirm={() => remove.mutate(event.id)}
              />
            )}
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

function DeleteConfirm({
  label,
  pending,
  onConfirm,
}: {
  label: string
  pending: boolean
  onConfirm: () => void
}) {
  useConfirmKey('d', onConfirm)
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Delete {label ? `“${label}”` : 'this'}?
        </AlertDialogTitle>
        <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={pending}
          onClick={onConfirm}
        >
          Delete
          <Kbd>d</Kbd>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
