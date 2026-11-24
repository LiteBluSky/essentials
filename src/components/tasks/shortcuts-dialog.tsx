import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'
import { MOD_LABEL } from '@/lib/shortcuts'

// Tasks' shortcuts, as shown (and changed) in the shared dialog
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
      { keys: [['1'], ['…'], ['9']], action: 'Open an “Up next” task' },
      { id: 'tasks.showDone', action: 'Show completed / open tasks' },
      { id: 'tasks.layout', action: 'Folders / one list' },
      { id: 'tasks.calendar', action: 'Calendar of the month' },
      COMMON.prevApp,
      COMMON.nextApp,
      COMMON.help,
      COMMON.confirm,
    ],
  },
  {
    title: 'Tree',
    shortcuts: [
      { id: 'tree.down', keys: [['↓']], action: 'Next row (list: card below)' },
      {
        id: 'tree.up',
        keys: [['↑']],
        action: 'Previous row (list: card above)',
      },
      {
        id: 'tree.collapse',
        keys: [['←']],
        action: 'Collapse folder / go to parent (list: card to the left)',
      },
      {
        id: 'tree.expand',
        keys: [['→']],
        action: 'Expand folder / into first child (list: card to the right)',
      },
      { id: 'tree.first', action: 'First row' },
      { id: 'tree.last', action: 'Last row' },
      { id: 'tree.nextItem', action: 'Next task' },
      { id: 'tree.prevItem', action: 'Previous task' },
      {
        id: 'tree.open',
        keys: [['Enter']],
        action: 'Open task / toggle folder',
      },
      {
        id: 'tree.new',
        action: 'New task in hovered or focused folder',
      },
      {
        id: 'tasks.complete',
        action: 'Complete / reopen hovered or focused task',
      },
      {
        id: 'tree.edit',
        keys: [['e']],
        action: 'Edit task / rename or move folder',
      },
      {
        id: 'tree.delete',
        action: 'Delete hovered or focused row (asks first)',
      },
      { id: 'tree.cut', action: 'Cut task' },
      {
        id: 'tree.paste',
        action: 'Paste cut task here (when one is cut)',
      },
      { keys: [['Esc']], action: 'Cancel cut' },
      { id: 'tree.clearSearch', action: 'Clear search and date filter' },
      { id: 'tree.collapseAll', action: 'Collapse all folders' },
    ],
  },
  {
    title: 'Open task',
    shortcuts: [
      { id: 'viewer.complete', action: 'Complete / reopen' },
      { id: 'viewer.edit', keys: [['r']], action: 'Edit' },
      { id: 'viewer.delete', keys: [['Del']], action: 'Delete (asks first)' },
      { keys: [['Esc']], action: 'Close' },
    ],
  },
  {
    title: 'Task form',
    shortcuts: [
      { keys: [['Enter']], action: 'Save (from the task field)' },
      { keys: [[MOD_LABEL, 'Enter']], action: 'Save (from the description)' },
      { keys: [['Esc']], action: 'Cancel' },
    ],
  },
  {
    title: 'Due date picker and calendar',
    shortcuts: [
      { id: 'days.prevDay', action: 'Previous day' },
      { id: 'days.nextDay', action: 'Next day' },
      { id: 'days.prevWeek', action: 'Previous week' },
      { id: 'days.nextWeek', action: 'Next week' },
      { id: 'days.nextMonth', action: 'Next month' },
      { id: 'days.prevMonth', action: 'Previous month' },
      { id: 'days.nextYear', action: 'Next year' },
      { id: 'days.prevYear', action: 'Previous year' },
      {
        keys: [['Enter']],
        action: 'Pick the date (calendar: show its tasks)',
      },
      { id: 'days.newTask', action: 'Calendar: new task due that day' },
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
