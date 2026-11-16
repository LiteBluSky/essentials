import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'

// Bookmarks' shortcuts, as shown (and changed) in the shared dialog
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
      COMMON.reference,
      COMMON.assistant,
      COMMON.hideAssistant,
      COMMON.newChat,
      { id: 'global.newFolder', action: 'New folder' },
      { keys: [['1'], ['…'], ['9']], action: 'Open favourite 1–9' },
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
      { id: 'tree.nextItem', action: 'Next link' },
      { id: 'tree.prevItem', action: 'Previous link' },
      {
        id: 'tree.open',
        keys: [['Enter']],
        action: 'Open link / toggle folder',
      },
      {
        id: 'tree.new',
        action: 'New link in hovered or focused folder',
      },
      { id: 'tree.edit', action: 'Edit link / rename or move folder' },
      {
        id: 'tree.delete',
        action: 'Delete hovered or focused row (asks first)',
      },
      { id: 'tree.cut', action: 'Cut link' },
      {
        id: 'tree.paste',
        action: 'Paste cut link here (when one is cut)',
      },
      { keys: [['Esc']], action: 'Cancel cut' },
      { id: 'bookmarks.favorite', action: 'Add / remove favourite' },
      { id: 'tree.clearSearch', action: 'Clear search' },
      { id: 'tree.collapseAll', action: 'Collapse all folders' },
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
    <ShortcutsHelp open={open} onOpenChange={onOpenChange} groups={GROUPS} />
  )
}
