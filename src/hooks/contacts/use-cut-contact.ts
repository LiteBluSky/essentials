import { useRef, useState } from 'react'

import { resolveMove } from '@/components/contacts/tree-dnd'
import type { DropTarget } from '@/components/contacts/tree-dnd'
import { toast } from '@/components/ui/toast'
import type { Contact } from '@/db/schema'
import { useMoveItem } from '@/hooks/contacts/use-move-item'
import { findFolder } from '@/lib/contacts/tree'
import type { Tree } from '@/lib/contacts/tree'

type PasteTarget = { kind: 'folder' | 'contact'; id: number } | null

// Keyboard cut & paste for contacts (`x` / `p` / `Esc` in the tree). While a
// contact is cut a sticky toast says so; closing it also cancels the cut.
export function useCutContact({
  tree,
  contacts,
  onExpand,
}: {
  tree: Tree
  contacts: Array<Contact>
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

  const cut = (contactId: number) => {
    const contact = contacts.find((l) => l.id === contactId)
    if (!contact) return
    cancel()
    const id = toast.add({
      title: `Cut “${contact.name}”`,
      description: 'Press p on a folder or contact to paste · Esc to cancel',
      timeout: 0,
      onClose: () => {
        if (toastId.current !== id) return
        toastId.current = null
        setCutId(null)
      },
    })
    toastId.current = id
    setCutId(contactId)
  }

  const paste = (target: PasteTarget) => {
    if (cutId === null) return
    const contact = contacts.find((l) => l.id === cutId)
    let drop: DropTarget | undefined = { kind: 'root' }
    if (target?.kind === 'folder') {
      const node = findFolder(tree, target.id)
      drop = node && { kind: 'folder', node }
    } else if (target?.kind === 'contact') {
      const sibling = contacts.find((l) => l.id === target.id)
      drop = sibling && { kind: 'contact', contact: sibling }
    }
    cancel()
    if (!contact || !drop) return

    // Into a folder (last), after a contact, or at the end of the top level.
    const next = resolveMove(
      tree,
      { kind: 'contact', id: contact.id },
      drop,
      drop.kind === 'contact' ? 'after' : 'inside',
    )
    if (!next) return
    move.mutate(next)
    if (next.parentId !== null) onExpand(next.parentId)
    toast.add({ title: `Moved “${contact.name}”`, type: 'success' })
  }

  return { cutId, cut, paste, cancel }
}
