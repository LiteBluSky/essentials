import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { Task } from '@/db/schema'
import type { OpenEditor } from './editor'
import { TaskAge, TaskCheck, TaskMenu, TaskTitle } from './task-tree'

// "Up next" above the search: the oldest open tasks, oldest first (keys
// 1-9), like the bookmark favourites. Newer tasks wait until these are done.
export function UpNext({
  tasks,
  onEdit,
  onComplete,
}: {
  tasks: Array<Task>
  onEdit: OpenEditor
  onComplete: (taskId: number) => void
}) {
  if (!tasks.length) return null
  return (
    <section aria-labelledby="up-next" className="flex flex-col">
      <h2
        id="up-next"
        className="px-2.5 pb-1 text-sm font-medium text-muted-foreground"
      >
        Up next
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
              <Kbd>{i + 1}</Kbd>
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
