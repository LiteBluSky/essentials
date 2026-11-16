import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'
import { ASSISTANT_NAME } from '@/lib/assistant'

// Chat's shortcuts, as shown (and changed) in the shared dialog
// (components/shortcuts-dialog.tsx). Rows with an `id` are shortcuts from
// lib/shortcuts.ts: the dialog shows the key each is on now; `keys` are
// fixed ones. Keep it in sync when adding or changing a shortcut.

const GROUPS: Array<ShortcutGroup> = [
  {
    title: 'Conversations',
    shortcuts: [
      { id: 'chat.next', keys: [['↓']], action: 'Next (older) conversation' },
      {
        id: 'chat.prev',
        keys: [['↑']],
        action: 'Previous (newer) conversation',
      },
      { id: 'chat.first', action: 'Latest conversation' },
      { id: 'chat.last', action: 'Oldest conversation' },
      { id: 'chat.new', action: 'New chat' },
      {
        id: 'chat.delete',
        keys: [['Del']],
        action: 'Delete the open conversation (asks first)',
      },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      { id: 'global.assistant', action: `Message ${ASSISTANT_NAME}` },
      COMMON.newChat,
      COMMON.globalSearch,
      COMMON.appSwitcher,
      COMMON.theme,
      COMMON.profile,
      {
        keys: [['@']],
        action: 'In the message box: link to a bookmark, note, task or contact',
      },
      COMMON.prevApp,
      COMMON.nextApp,
      COMMON.help,
      COMMON.confirm,
    ],
  },
  {
    title: 'Message box',
    shortcuts: [
      { keys: [['Enter']], action: 'Send' },
      { keys: [['Shift', 'Enter']], action: 'New line' },
      {
        keys: [['Esc']],
        action:
          'Stop the answer being written; else leave the box (the keys above work again)',
      },
    ],
  },
]

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ShortcutsHelp
      open={open}
      onOpenChange={onOpenChange}
      groups={GROUPS}
      description="Keys are off while typing a message or while a dialog is open."
    />
  )
}
