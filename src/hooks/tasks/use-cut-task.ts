import { useRef, useState } from 'react'

import { resolveMove } from '@/components/tasks/tree-dnd'
import type { DropTarget } from '@/components/tasks/tree-dnd'
import { toast } from '@/components/ui/toast'
import type { Task } from '@/db/schema'
import { useMoveItem } from '@/hooks/tasks/use-move-item'
import { findFolder } from '@/lib/tasks/tree'
import type { Tree } from '@/lib/tasks/tree'

type PasteTarget = { kind: 'folder' | 'task'; id: number } | null

// Keyboard cut & paste for tasks (`x` / `p` / `Esc` in the tree). While a
// task is cut a sticky toast says so; closing it also cancels the cut.
export function useCutTask({
  tree,
  tasks,
  onExpand,
}: {
  tree: Tree
  tasks: Array<Task>
  onExpand: (folderId: number) => void
}) {
  const move = useMoveItem()
  const [cutId, setCutId] = useState<number | null>(null)
  const toastId = useRef<string | null>(null)

  const cancel = () => {
    const id = toastId.current
    toastId.current = null
    setCutId(null)
    if (id) toast.close(id)
    return id !== null
  }

  const cut = (taskId: number) => {
    const task = tasks.find((l) => l.id === taskId)
    if (!task) return
    cancel()
    const id = toast.add({
      title: `Cut “${task.title}”`,
      description: 'Press p on a folder or task to paste · Esc to cancel',
      timeout: 0,
      onClose: () => {
        if (toastId.current !== id) return
        toastId.current = null
        setCutId(null)
      },
    })
    toastId.current = id
    setCutId(taskId)
  }

  // false when nothing is cut (then `p` is free for the profile switcher).
  const paste = (target: PasteTarget): boolean => {
    if (cutId === null) return false
    const task = tasks.find((l) => l.id === cutId)
    let drop: DropTarget | undefined = { kind: 'root' }
    if (target?.kind === 'folder') {
      const node = findFolder(tree, target.id)
      drop = node && { kind: 'folder', node }
    } else if (target?.kind === 'task') {
      const sibling = tasks.find((l) => l.id === target.id)
      drop = sibling && { kind: 'task', task: sibling }
    }
    cancel()
    if (!task || !drop) return true

    // Into a folder (last), after a task, or at the end of the top level.
    const next = resolveMove(
      tree,
      { kind: 'task', id: task.id },
      drop,
      drop.kind === 'task' ? 'after' : 'inside',
    )
    if (!next) return true
    move.mutate(next)
    if (next.parentId !== null) onExpand(next.parentId)
    toast.add({ title: `Moved “${task.title}”`, type: 'success' })
    return true
  }

  return { cutId, cut, paste, cancel }
}
