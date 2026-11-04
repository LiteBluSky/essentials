import { format, isToday } from 'date-fns'
import { PlusIcon } from 'lucide-react'
import { createContext, use, useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import type { Task } from '@/db/schema'
import { useCalendarKeys } from '@/hooks/tasks/use-calendar-keys'
import { taskTone, todayName } from '@/lib/tasks/tree'
import { cn } from '@/lib/utils'
import type { TaskTone } from '@/lib/tasks/tree'

// One dot per task created that day, in the task's colour (as in the tree).
const DOT_TONE: Record<TaskTone, string> = {
  overdue: 'bg-destructive',
  due: 'bg-warning',
  done: 'bg-success',
  fresh: 'bg-muted-foreground',
}
const MAX_DOTS = 4

const TasksByDay = createContext<ReadonlyMap<string, Array<Task>>>(new Map())

/** A calendar day with a dot per task created on it. */
function DayWithDots({
  children,
  ...props
}: ComponentProps<typeof CalendarDayButton>) {
  const tasks = use(TasksByDay).get(todayName(props.day.date)) ?? []
  return (
    <CalendarDayButton {...props}>
      {children}
      {tasks.length > 0 && (
        <span className="flex gap-0.5" aria-hidden>
          {tasks.slice(0, MAX_DOTS).map((task) => (
            <span
              key={task.id}
              className={cn('size-1.5 rounded-full', DOT_TONE[taskTone(task)])}
            />
          ))}
        </span>
      )}
    </CalendarDayButton>
  )
}

/** The key hints under a calendar: motions, then its own action key. */
export function CalendarKeysHint({
  action,
  actionKey,
}: {
  action: string
  actionKey: string
}) {
  return (
    <p className="flex flex-wrap items-center gap-1 border-t px-3 py-2 text-xs text-muted-foreground">
      <Kbd>h</Kbd>
      <Kbd>l</Kbd> day · <Kbd>j</Kbd>
      <Kbd>k</Kbd> week · <Kbd>m</Kbd>
      <Kbd>M</Kbd> month · <Kbd>y</Kbd>
      <Kbd>Y</Kbd> year · <Kbd>{actionKey}</Kbd> {action}
    </p>
  )
}

/**
 * The month at a glance (`i` or the header button): a dot per task on the
 * day it was created, coloured like the task. The same keys as the form's
 * date picker move the selection; `a` (or the button) starts a new task
 * dated that day.
 */
export function CalendarDialog({
  open,
  onOpenChange,
  tasks,
  onNewTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: Array<Task>
  /** New task on this day (opened once this dialog has closed). */
  onNewTask: (date: Date) => void
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Array<Task>>()
    for (const task of tasks) {
      const key = todayName(task.createdAt)
      const list = map.get(key)
      if (list) list.push(task)
      else map.set(key, [task])
    }
    return map
  }, [tasks])

  // Acted on once closed, so the dialog doesn't take focus back from the
  // task form.
  const picked = useRef<Date | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        const date = picked.current
        if (isOpen || !date) return
        picked.current = null
        onNewTask(date)
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        finalFocus={() => picked.current === null}
      >
        <TasksByDay value={byDay}>
          <CalendarBody
            byDay={byDay}
            onPick={(date) => {
              picked.current = date
              onOpenChange(false)
            }}
          />
        </TasksByDay>
      </DialogContent>
    </Dialog>
  )
}

// Mounted per opening, so it starts on today.
function CalendarBody({
  byDay,
  onPick,
}: {
  byDay: ReadonlyMap<string, Array<Task>>
  onPick: (date: Date) => void
}) {
  const [date, setDate] = useState(() => new Date())
  const keys = useCalendarKeys(date, setDate)
  const dayTasks = byDay.get(todayName(date)) ?? []
  const done = dayTasks.filter((t) => t.completedAt !== null).length

  return (
    <div
      ref={keys.ref}
      className="flex flex-col gap-4"
      onKeyDownCapture={(e) => {
        if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onPick(date)
          return
        }
        keys.onKeyDownCapture(e)
      }}
    >
      <DialogHeader>
        <DialogTitle>Calendar</DialogTitle>
        <DialogDescription>
          {format(date, 'EEEE d MMMM yyyy')}
          {isToday(date) && ' (today)'} ·{' '}
          {dayTasks.length
            ? `${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}, ${done} done`
            : 'no tasks'}
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center">
        <Calendar
          mode="single"
          required
          autoFocus
          selected={date}
          onSelect={setDate}
          month={keys.month}
          onMonthChange={keys.setMonth}
          components={{ DayButton: DayWithDots }}
          className="[--cell-size:--spacing(11)]"
        />
      </div>
      <CalendarKeysHint action="new task" actionKey="a" />
      <DialogFooter>
        <Button onClick={() => onPick(date)}>
          <PlusIcon data-icon="inline-start" />
          New task on {format(date, 'd MMM')}
          <Kbd>a</Kbd>
        </Button>
      </DialogFooter>
    </div>
  )
}
