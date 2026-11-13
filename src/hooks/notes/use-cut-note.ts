import { useRef, useState } from 'react'

import { resolveMove } from '@/components/notes/tree-dnd'
import type { DropTarget } from '@/components/notes/tree-dnd'
import { toast } from '@/components/ui/toast'
import type { Note } from '@/db/schema'
import { useMoveItem } from '@/hooks/notes/use-move-item'
import { findFolder, noteLabel } from '@/lib/notes/tree'
import type { Tree } from '@/lib/notes/tree'

type PasteTarget = { kind: 'folder' | 'note'; id: number } | null

// Keyboard cut & paste for notes (`x` / `p` / `Esc` in the tree). While a
// note is cut a sticky toast says so; closing it also cancels the cut.
export function useCutNote({
  tree,
  notes,
  onExpand,
}: {
  tree: Tree
  notes: Array<Note>
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

  const cut = (noteId: number) => {
    const note = notes.find((l) => l.id === noteId)
    if (!note) return
    cancel()
    const id = toast.add({
      title: `Cut “${noteLabel(note)}”`,
      description: 'Press p on a folder or note to paste · Esc to cancel',
      timeout: 0,
      onClose: () => {
        if (toastId.current !== id) return
        toastId.current = null
        setCutId(null)
      },
    })
    toastId.current = id
    setCutId(noteId)
  }

  // false when nothing is cut (then `p` is free for the profile switcher).
  const paste = (target: PasteTarget): boolean => {
    if (cutId === null) return false
    const note = notes.find((l) => l.id === cutId)
    let drop: DropTarget | undefined = { kind: 'root' }
    if (target?.kind === 'folder') {
      const node = findFolder(tree, target.id)
      drop = node && { kind: 'folder', node }
    } else if (target?.kind === 'note') {
      const sibling = notes.find((l) => l.id === target.id)
      drop = sibling && { kind: 'note', note: sibling }
    }
    cancel()
    if (!note || !drop) return true

    // Into a folder (last), after a note, or at the end of the top level.
    const next = resolveMove(
      tree,
      { kind: 'note', id: note.id },
      drop,
      drop.kind === 'note' ? 'after' : 'inside',
    )
    if (!next) return true
    move.mutate(next)
    if (next.parentId !== null) onExpand(next.parentId)
    toast.add({ title: `Moved “${noteLabel(note)}”`, type: 'success' })
    return true
  }

  return { cutId, cut, paste, cancel }
}
