import { useCallback, useEffect, useState } from 'react'

import type { TaskStatus } from '@/lib/tasks/tree'

export type TaskLayout = 'folders' | 'list'
export type TaskView = { status: TaskStatus; layout: TaskLayout }

const STORAGE_KEY = 'tasks:view'
const DEFAULT: TaskView = { status: 'open', layout: 'folders' }

// Open/completed (`d`) and folders/flat list (`v`), remembered across
// reloads. Starts at the default on the server and first client render, then
// restores from localStorage after hydration.
export function useTaskView() {
  const [view, setView] = useState<TaskView>(DEFAULT)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setView({ ...DEFAULT, ...(JSON.parse(stored) as TaskView) })
    } catch {
      // Unavailable or corrupt storage — keep the default.
    }
  }, [])

  const update = useCallback((change: (prev: TaskView) => TaskView) => {
    setView((prev) => {
      const next = change(prev)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore — the view just won't persist.
      }
      return next
    })
  }, [])

  return {
    view,
    setStatus: (status: TaskStatus) => update((prev) => ({ ...prev, status })),
    setLayout: (layout: TaskLayout) => update((prev) => ({ ...prev, layout })),
    toggleStatus: () =>
      update((prev) => ({
        ...prev,
        status: prev.status === 'open' ? 'done' : 'open',
      })),
    toggleLayout: () =>
      update((prev) => ({
        ...prev,
        layout: prev.layout === 'folders' ? 'list' : 'folders',
      })),
  }
}
