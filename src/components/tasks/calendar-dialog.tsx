import { format, isToday } from 'date-fns'
import { ListFilterIcon, PlusIcon } from 'lucide-react'
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
import { taskDay, taskTone, todayName } from '@/lib/tasks/tree'
import { cn } from '@/lib/utils'
import type { TaskTone } from '@/lib/tasks/tree'

// One dot per task on that day (due then, else created then), in the task's
// colour (as in the tree).
const DOT_TONE: Record<TaskTone, string> = {
  overdue: 'bg-destructive',
  due: 'bg-warning',
  done: 'bg-success',
  fresh: 'bg-muted-foreground',
}
const MAX_DOTS = 4

const TasksByDay = createContext<ReadonlyMap<string, Array<Task>>>(new Map())

/** A calendar day with a dot per task on it. */
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
 * day it's due (or was created, without a due date), coloured like the
 * task. The same keys as the form's
 * date picker move the selection (a click selects too); Enter (or the
 * button) shows that day's tasks in the list, `a` (or the button) starts a
 * new task due that day.
 */
export function CalendarDialog({
  open,
  onOpenChange,
  tasks,
  selected,
  onNewTask,
  onShowDay,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: Array<Task>
  /** The day it opens on (the list's date filter); else today. */
  selected?: Date
  /** New task due this day (opened once this dialog has closed). */
  onNewTask: (date: Date) => void
  /** Filter the list to this day's tasks. */
  onShowDay: (date: Date) => void
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Array<Task>>()
    for (const task of tasks) {
      const key = todayName(taskDay(task))
      const list = map.get(key)
      if (list) list.push(task)
      else map.set(key, [task])
    }
    return map
  }, [tasks])

  // A new task is opened once this dialog is gone, and this dialog doesn't
  // hand focus back to what opened it (the form has it by then). The flag is
  // only reset once it has opened again: Base UI may restore focus after
  // onOpenChangeComplete.
  const picked = useRef<Date | null>(null)
  const returnFocus = useRef(true)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) returnFocus.current = true
        const date = picked.current
        if (isOpen || !date) return
        picked.current = null
        // After the popup has unmounted and any focus handling is done.
        setTimeout(() => onNewTask(date))
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        finalFocus={() => returnFocus.current}
      >
        <TasksByDay value={byDay}>
          <CalendarBody
            byDay={byDay}
            initial={selected}
            onNewTask={(date) => {
              picked.current = date
              returnFocus.current = false
              onOpenChange(false)
            }}
            onShowDay={(date) => {
              onShowDay(date)
              onOpenChange(false)
            }}
          />
        </TasksByDay>
      </DialogContent>
    </Dialog>
  )
}

// Mounted per opening, so it starts on `initial` (or today) each time.
function CalendarBody({
  byDay,
  initial,
  onNewTask,
  onShowDay,
}: {
  byDay: ReadonlyMap<string, Array<Task>>
  initial?: Date
  onNewTask: (date: Date) => void
  onShowDay: (date: Date) => void
}) {
  const [date, setDate] = useState(() => initial ?? new Date())
  const keys = useCalendarKeys(date, setDate)
  const dayTasks = byDay.get(todayName(date)) ?? []
  const done = dayTasks.filter((t) => t.completedAt !== null).length

  return (
    <div
      ref={keys.ref}
      className="flex flex-col gap-4"
      onKeyDownCapture={(e) => {
        const plain = !e.ctrlKey && !e.metaKey && !e.altKey
        if (plain && (e.key === 'a' || e.key === 'Enter')) {
          // Before the focused day's own Enter (which would just select it).
          e.preventDefault()
          e.stopPropagation()
          if (e.key === 'a') onNewTask(date)
          else onShowDay(date)
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
      <CalendarKeysHint action="show its tasks" actionKey="Enter" />
      <DialogFooter>
        <Button variant="outline" onClick={() => onShowDay(date)}>
          <ListFilterIcon data-icon="inline-start" />
          Show {format(date, 'd MMM')}
          <Kbd>Enter</Kbd>
        </Button>
        <Button onClick={() => onNewTask(date)}>
          <PlusIcon data-icon="inline-start" />
          New task due {format(date, 'd MMM')}
          <Kbd>a</Kbd>
        </Button>
      </DialogFooter>
    </div>
  )
}
