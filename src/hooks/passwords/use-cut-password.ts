import { useRef, useState } from 'react'

import { resolveMove } from '@/components/passwords/tree-dnd'
import type { DropTarget } from '@/components/passwords/tree-dnd'
import { toast } from '@/components/ui/toast'
import type { Password } from '@/db/schema'
import { useMoveItem } from '@/hooks/passwords/use-move-item'
import { findFolder } from '@/lib/passwords/tree'
import type { Tree } from '@/lib/passwords/tree'

type PasteTarget = { kind: 'folder' | 'password'; id: number } | null

// Keyboard cut & paste for passwords (`x` / `p` / `Esc` in the tree). While a
// password is cut a sticky toast says so; closing it also cancels the cut.
export function useCutPassword({
  tree,
  passwords,
  onExpand,
}: {
  tree: Tree
  passwords: Array<Password>
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

  const cut = (passwordId: number) => {
    const password = passwords.find((l) => l.id === passwordId)
    if (!password) return
    cancel()
    const id = toast.add({
      title: `Cut “${password.name}”`,
      description: 'Press p on a folder or password to paste · Esc to cancel',
      timeout: 0,
      onClose: () => {
        if (toastId.current !== id) return
        toastId.current = null
        setCutId(null)
      },
    })
    toastId.current = id
    setCutId(passwordId)
  }

  // false when nothing is cut (then `p` is free for the profile switcher).
  const paste = (target: PasteTarget): boolean => {
    if (cutId === null) return false
    const password = passwords.find((l) => l.id === cutId)
    let drop: DropTarget | undefined = { kind: 'root' }
    if (target?.kind === 'folder') {
      const node = findFolder(tree, target.id)
      drop = node && { kind: 'folder', node }
    } else if (target?.kind === 'password') {
      const sibling = passwords.find((l) => l.id === target.id)
      drop = sibling && { kind: 'password', password: sibling }
    }
    cancel()
    if (!password || !drop) return true

    // Into a folder (last), after a password, or at the end of the top level.
    const next = resolveMove(
      tree,
      { kind: 'password', id: password.id },
      drop,
      drop.kind === 'password' ? 'after' : 'inside',
    )
    if (!next) return true
    move.mutate(next)
    if (next.parentId !== null) onExpand(next.parentId)
    toast.add({ title: `Moved “${password.name}”`, type: 'success' })
    return true
  }

  return { cutId, cut, paste, cancel }
}
