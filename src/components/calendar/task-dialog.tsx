import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'

import { EditorDialogs } from '@/components/tasks/editor-dialogs'
import type { EditorState } from '@/components/tasks/editor'
import { useCompleteTask } from '@/hooks/tasks/use-complete-task'
import { buildTree } from '@/lib/tasks/tree'
import { calendarQueryOptions } from '@/server/calendar.functions'
import { tasksTreeQueryOptions } from '@/server/tasks.functions'

// A task's strip opens the task here, in Tasks' own dialogs (details, then
// edit / complete / delete), so the user stays on the Calendar. The one place
// an app reuses another's components: the task dialog is the same thing
// wherever it opens. The caller loads the tasks tree before opening.
export function CalendarTaskDialog({
  state,
  open,
  onOpenChange,
  onChange,
}: {
  state: EditorState | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (state: EditorState) => void
}) {
  const queryClient = useQueryClient()
  const { data, dataUpdatedAt } = useQuery({
    ...tasksTreeQueryOptions,
    enabled: state !== null,
  })
  const complete = useCompleteTask()
  const tree = useMemo(
    () => (data ? buildTree(data.folders, data.tasks) : null),
    [data],
  )

  // Whatever changed the task (completed, edited, deleted) changes its strip.
  const seen = useRef(dataUpdatedAt)
  useEffect(() => {
    if (dataUpdatedAt === seen.current) return
    seen.current = dataUpdatedAt
    void queryClient.invalidateQueries(calendarQueryOptions)
  }, [dataUpdatedAt, queryClient])

  if (!data || !tree) return null
  return (
    <EditorDialogs
      tree={tree}
      tasks={data.tasks}
      state={state}
      open={open}
      onOpenChange={onOpenChange}
      onChange={onChange}
      onComplete={complete}
      onSaved={() => {}}
    />
  )
}
