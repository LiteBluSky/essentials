import { RowContextMenu } from '@/components/row-context-menu'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { Task } from '@/db/schema'
import { UP_NEXT_KEYS, upNextDayLabel } from '@/lib/tasks/tree'
import type { UpNext as UpNextList } from '@/lib/tasks/tree'
import type { OpenEditor } from './editor'
import {
  TaskAge,
  TaskCheck,
  TaskMenu,
  TaskMenuItems,
  TaskTitle,
} from './task-tree'

type ListProps = {
  tasks: Array<Task>
  onEdit: OpenEditor
  onComplete: (taskId: number) => void
}

// "Up next" above the search: one day's open tasks (`upNext`), today's or
// else the next day that has any; the first 9 have keys 1-9. Only after
// hydration: the day is the browser's.
export function UpNext({
  next,
  ...props
}: Omit<ListProps, 'tasks'> & { next: UpNextList | null }) {
  if (!next) return null
  return (
    <QuickList
      id="up-next"
      title={`Up next · ${upNextDayLabel(next.day)}`}
      numbered
      tasks={next.tasks}
      {...props}
    />
  )
}

function QuickList({
  id,
  title,
  numbered = false,
  tasks,
  onEdit,
  onComplete,
}: ListProps & { id: string; title: string; numbered?: boolean }) {
  if (!tasks.length) return null
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2
        id={id}
        className="px-2.5 pb-1 text-sm font-medium text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-col">
        {tasks.map((task, i) => (
          <RowContextMenu
            key={task.id}
            menu={
              <TaskMenuItems
                task={task}
                onEdit={onEdit}
                onComplete={onComplete}
              />
            }
            render={<li className="group/row flex items-center gap-1" />}
          >
            <TaskCheck task={task} onComplete={onComplete} />
            <Button
              variant="ghost"
              className="min-w-0 flex-1 justify-start"
              title={task.description || undefined}
              onClick={() =>
                onEdit({ kind: 'task', mode: 'view', taskId: task.id })
              }
            >
              {numbered && i < UP_NEXT_KEYS && <Kbd>{i + 1}</Kbd>}
              <TaskTitle task={task} />
              <TaskAge task={task} className="ml-auto" />
            </Button>
            <TaskMenu task={task} onEdit={onEdit} onComplete={onComplete} />
          </RowContextMenu>
        ))}
      </ul>
    </section>
  )
}
