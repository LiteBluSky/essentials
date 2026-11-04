import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { Task } from '@/db/schema'
import type { OpenEditor } from './editor'
import { TaskAge, TaskCheck, TaskMenu, TaskTitle } from './task-tree'

type ListProps = {
  tasks: Array<Task>
  onEdit: OpenEditor
  onComplete: (taskId: number) => void
}

// "Up next" above the search: the oldest open tasks, oldest first (keys
// 1-9), like the bookmark favourites. Newer tasks wait until these are done.
export function UpNext(props: ListProps) {
  return <QuickList id="up-next" title="Up next" numbered {...props} />
}

// "Today": the tasks dated today, wherever they're filed (open and done).
// Only after hydration: "today" is the browser's date.
export function TodayTasks(props: ListProps) {
  return <QuickList id="today" title="Today" {...props} />
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
          <li key={task.id} className="group/row flex items-center gap-1">
            <TaskCheck task={task} onComplete={onComplete} />
            <Button
              variant="ghost"
              className="min-w-0 flex-1 justify-start"
              title={task.description || undefined}
              onClick={() =>
                onEdit({ kind: 'task', mode: 'view', taskId: task.id })
              }
            >
              {numbered && <Kbd>{i + 1}</Kbd>}
              <TaskTitle task={task} />
              <TaskAge task={task} className="ml-auto" />
            </Button>
            <TaskMenu task={task} onEdit={onEdit} onComplete={onComplete} />
          </li>
        ))}
      </ul>
    </section>
  )
}
