import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'

// Passwords' shortcuts, as shown (and changed) in the shared dialog
// (components/shortcuts-dialog.tsx). Rows with an `id` are shortcuts from
// lib/shortcuts.ts: the dialog shows the key each is on now; `keys` are
// fixed ones. Keep it in sync when adding or changing a shortcut.

const GROUPS: Array<ShortcutGroup> = [
  {
    title: 'Anywhere',
    shortcuts: [
      { id: 'global.search', action: 'Search this app' },
      { id: 'tree.searchBox', action: 'Search this app (from the tree)' },
      COMMON.globalSearch,
      COMMON.appSwitcher,
      COMMON.theme,
      COMMON.profile,
      COMMON.toasts,
      COMMON.undoToast,
      COMMON.stopJarvis,
      COMMON.reference,
      COMMON.assistant,
      COMMON.hideAssistant,
      COMMON.newChat,
      { id: 'global.newFolder', action: 'New folder' },
      COMMON.prevApp,
      COMMON.nextApp,
      COMMON.help,
      COMMON.confirm,
    ],
  },
  {
    title: 'Tree',
    shortcuts: [
      { id: 'tree.down', keys: [['↓']], action: 'Next row' },
      { id: 'tree.up', keys: [['↑']], action: 'Previous row' },
      {
        id: 'tree.collapse',
        keys: [['←']],
        action: 'Collapse folder / go to parent',
      },
      {
        id: 'tree.expand',
        keys: [['→']],
        action: 'Expand folder / into first child',
      },
      { id: 'tree.first', action: 'First row' },
      { id: 'tree.last', action: 'Last row' },
      { id: 'tree.nextItem', action: 'Next password' },
      { id: 'tree.prevItem', action: 'Previous password' },
      {
        id: 'tree.open',
        keys: [['Enter']],
        action: 'Show password / toggle folder',
      },
      {
        id: 'tree.new',
        action: 'New password in hovered or focused folder',
      },
      { id: 'tree.edit', action: 'Edit password / rename or move folder' },
      {
        id: 'tree.delete',
        action: 'Delete hovered or focused row (asks first)',
      },
      { id: 'tree.cut', action: 'Cut password' },
      {
        id: 'tree.paste',
        action: 'Paste cut password here (when one is cut)',
      },
      { keys: [['Esc']], action: 'Cancel cut' },
      {
        id: 'passwords.copyPassword',
        action: 'Copy the hovered or focused password',
      },
      { id: 'passwords.copyUsername', action: 'Copy its username' },
      { id: 'passwords.openSite', action: 'Open its website' },
      { id: 'tree.clearSearch', action: 'Clear search' },
      { id: 'tree.collapseAll', action: 'Collapse all folders' },
    ],
  },
  {
    title: 'Vault',
    shortcuts: [
      {
        id: 'passwords.lock',
        action: 'Lock (asks for the master password again)',
      },
      {
        keys: [['Enter']],
        action: 'In the master password box: unlock',
      },
    ],
  },
  {
    title: 'Password details',
    shortcuts: [
      { id: 'passwords.copyPassword', action: 'Copy the password' },
      { id: 'passwords.copyUsername', action: 'Copy the username' },
      { id: 'passwords.reveal', action: 'Show / hide the password' },
      { id: 'passwords.openSite', action: 'Open the website' },
      { id: 'viewer.edit', action: 'Edit' },
      { id: 'viewer.delete', keys: [['Del']], action: 'Delete (asks first)' },
    ],
  },
  {
    title: 'Search box',
    shortcuts: [
      { keys: [['Enter'], ['↓']], action: 'Jump to first result' },
      { keys: [['Esc']], action: 'Clear search' },
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
      description="Everything works from the keyboard: the tree keys are off while typing, while a dialog is open or while locked."
    />
  )
}
