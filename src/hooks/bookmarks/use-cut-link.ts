import { useRef, useState } from 'react'

import { resolveMove } from '@/components/bookmarks/tree-dnd'
import type { DropTarget } from '@/components/bookmarks/tree-dnd'
import { toast } from '@/components/ui/toast'
import type { Link } from '@/db/schema'
import { useMoveBookmark } from '@/hooks/bookmarks/use-move-bookmark'
import { findFolder } from '@/lib/bookmarks/tree'
import type { Tree } from '@/lib/bookmarks/tree'

type PasteTarget = { kind: 'folder' | 'link'; id: number } | null

// Keyboard cut & paste for links (`x` / `p` / `Esc` in the tree). While a
// link is cut a sticky toast says so; closing it also cancels the cut.
export function useCutLink({
  tree,
  links,
  onExpand,
}: {
  tree: Tree
  links: Array<Link>
  onExpand: (folderId: number) => void
}) {
  const move = useMoveBookmark()
  const [cutId, setCutId] = useState<number | null>(null)
  const toastId = useRef<string | null>(null)

  const cancel = () => {
    const id = toastId.current
    toastId.current = null
    setCutId(null)
    if (id) toast.close(id)
    return id !== null
  }

  const cut = (linkId: number) => {
    const link = links.find((l) => l.id === linkId)
    if (!link) return
    cancel()
    const id = toast.add({
      title: `Cut “${link.title}”`,
      description: 'Press p on a folder or link to paste · Esc to cancel',
      timeout: 0,
      onClose: () => {
        if (toastId.current !== id) return
        toastId.current = null
        setCutId(null)
      },
    })
    toastId.current = id
    setCutId(linkId)
  }

  // false when nothing is cut (then `p` is free for the profile switcher).
  const paste = (target: PasteTarget): boolean => {
    if (cutId === null) return false
    const link = links.find((l) => l.id === cutId)
    let drop: DropTarget | undefined = { kind: 'root' }
    if (target?.kind === 'folder') {
      const node = findFolder(tree, target.id)
      drop = node && { kind: 'folder', node }
    } else if (target?.kind === 'link') {
      const sibling = links.find((l) => l.id === target.id)
      drop = sibling && { kind: 'link', link: sibling }
    }
    cancel()
    if (!link || !drop) return true

    // Into a folder (last), after a link, or at the end of the top level.
    const next = resolveMove(
      tree,
      { kind: 'link', id: link.id },
      drop,
      drop.kind === 'link' ? 'after' : 'inside',
    )
    if (!next) return true
    move.mutate(next)
    if (next.parentId !== null) onExpand(next.parentId)
    toast.add({ title: `Moved “${link.title}”`, type: 'success' })
    return true
  }

  return { cutId, cut, paste, cancel }
}
