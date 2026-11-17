import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'
import { MOD_LABEL } from '@/lib/shortcuts'

// Notes' shortcuts, as shown (and changed) in the shared dialog
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
      COMMON.stopJarvis,
      COMMON.reference,
      COMMON.assistant,
      COMMON.hideAssistant,
      COMMON.newChat,
      { id: 'global.newFolder', action: 'New folder' },
      { keys: [['1'], ['…'], ['4']], action: 'Open recent note 1–4' },
      { keys: [['5'], ['…'], ['8']], action: 'Open most viewed note 5–8' },
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
      { id: 'tree.nextItem', action: 'Next note' },
      { id: 'tree.prevItem', action: 'Previous note' },
      {
        id: 'tree.open',
        keys: [['Enter']],
        action: 'Open note / toggle folder',
      },
      {
        id: 'tree.new',
        action: 'New note in hovered or focused folder',
      },
      {
        id: 'tree.edit',
        keys: [['e']],
        action: 'Edit note / rename or move folder',
      },
      {
        id: 'tree.delete',
        action: 'Delete hovered or focused row (asks first)',
      },
      { id: 'tree.cut', action: 'Cut note' },
      {
        id: 'tree.paste',
        action: 'Paste cut note here (when one is cut)',
      },
      { keys: [['Esc']], action: 'Cancel cut' },
      { id: 'tree.clearSearch', action: 'Clear search' },
      { id: 'tree.collapseAll', action: 'Collapse all folders' },
    ],
  },
  {
    title: 'Open note',
    shortcuts: [
      { id: 'viewer.scrollDown', action: 'Scroll down' },
      { id: 'viewer.scrollUp', action: 'Scroll up' },
      { id: 'viewer.edit', keys: [['r']], action: 'Edit' },
      { id: 'viewer.delete', action: 'Delete (asks first)' },
      { keys: [[MOD_LABEL, 'P']], action: 'Print (or Save as PDF)' },
      { keys: [['Esc']], action: 'Close' },
    ],
  },
  {
    title: 'Writing',
    shortcuts: [
      {
        id: 'editor.save',
        keys: [[MOD_LABEL, 'Enter']],
        action: 'Save and show the note',
      },
      { keys: [['Esc']], action: 'Save and close' },
      { id: 'editor.bold', action: 'Bold' },
      { id: 'editor.italic', action: 'Italic' },
      { id: 'editor.link', action: 'Link' },
      {
        id: 'editor.format',
        action: 'Format the line: pick from the toolbar',
      },
      { keys: [['h'], ['l']], action: '… previous / next format' },
      { keys: [['0'], ['$']], action: '… first / last format' },
      { keys: [['Enter']], action: '… apply it (Esc cancels)' },
      { keys: [['Enter']], action: 'Continue the list' },
      { keys: [['Tab'], ['Shift', 'Tab']], action: 'Indent / outdent' },
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
