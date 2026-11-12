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
 * task, and the selected day's tasks listed below (a click opens one). The
 * same keys as the form's date picker move the selection (a click selects
 * too); Enter (or the button) shows that day's tasks in the list, `a` (or
 * the button) starts a new task due that day.
 */
export function CalendarDialog({
  open,
  onOpenChange,
  tasks,
  selected,
  onNewTask,
  onOpenTask,
  onShowDay,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: Array<Task>
  /** The day it opens on (the list's date filter); else today. */
  selected?: Date
  /** New task due this day (opened once this dialog has closed). */
  onNewTask: (date: Date) => void
  /** Open a task's details (once this dialog has closed). */
  onOpenTask: (id: number) => void
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
    for (const list of map.values()) {
      list.sort((a, b) => taskDay(a).getTime() - taskDay(b).getTime())
    }
    return map
  }, [tasks])

  // A new task / a task's details open once this dialog is gone, and this
  // dialog doesn't hand focus back to what opened it (the other dialog has
  // it by then). The flag is only reset once it has opened again: Base UI
  // may restore focus after onOpenChangeComplete.
  const picked = useRef<Picked | null>(null)
  const returnFocus = useRef(true)
  const pick = (next: Picked) => {
    picked.current = next
    returnFocus.current = false
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) returnFocus.current = true
        const next = picked.current
        if (isOpen || !next) return
        picked.current = null
        // After the popup has unmounted and any focus handling is done.
        setTimeout(() =>
          next.kind === 'new' ? onNewTask(next.date) : onOpenTask(next.id),
        )
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
            onNewTask={(date) => pick({ kind: 'new', date })}
            onOpenTask={(id) => pick({ kind: 'open', id })}
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

type Picked = { kind: 'new'; date: Date } | { kind: 'open'; id: number }

// Mounted per opening, so it starts on `initial` (or today) each time.
function CalendarBody({
  byDay,
  initial,
  onNewTask,
  onOpenTask,
  onShowDay,
}: {
  byDay: ReadonlyMap<string, Array<Task>>
  initial?: Date
  onNewTask: (date: Date) => void
  onOpenTask: (id: number) => void
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
      {dayTasks.length > 0 && (
        <ul className="flex max-h-48 flex-col overflow-y-auto">
          {dayTasks.map((task) => (
            <li key={task.id}>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => onOpenTask(task.id)}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    DOT_TONE[taskTone(task)],
                  )}
                />
                <span
                  className={cn(
                    'truncate',
                    task.completedAt && 'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                </span>
                {task.dueAt && (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {format(task.dueAt, 'HH:mm')}
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
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
