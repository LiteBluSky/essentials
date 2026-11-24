import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'
import { MOD_LABEL } from '@/lib/shortcuts'

// The Calendar's shortcuts, as shown (and changed) in the shared dialog
// (components/shortcuts-dialog.tsx). Rows with an `id` are shortcuts from
// lib/shortcuts.ts: the dialog shows the key each is on now; `keys` are
// fixed ones. Keep it in sync when adding or changing a shortcut.

const GROUPS: Array<ShortcutGroup> = [
  {
    title: 'Days',
    shortcuts: [
      { id: 'calendar.left', keys: [['←']], action: 'Previous day' },
      { id: 'calendar.right', keys: [['→']], action: 'Next day' },
      { id: 'calendar.up', keys: [['↑']], action: 'Same day last week' },
      { id: 'calendar.down', keys: [['↓']], action: 'Same day next week' },
      {
        id: 'calendar.weekStart',
        keys: [['Home']],
        action: 'Beginning of the week',
      },
      { id: 'calendar.weekEnd', keys: [['End']], action: 'End of the week' },
      { id: 'calendar.prevMonth', keys: [['PgUp']], action: 'Previous month' },
      { id: 'calendar.nextMonth', keys: [['PgDn']], action: 'Next month' },
      {
        keys: [['Scroll']],
        action:
          'Mouse wheel / swipe up or down over the month: next / previous',
      },
      { id: 'calendar.today', action: 'Today' },
      {
        id: 'calendar.tasks',
        action: 'Open the focused day’s tasks in Tasks',
      },
    ],
  },
  {
    title: 'Strips',
    shortcuts: [
      {
        keys: [['Drag']],
        action:
          'Mouse: drag over days (or click one) to add a strip. Touch: tap the first day, then the last',
      },
      {
        keys: [['Enter'], ['Space']],
        action:
          'Start a range on the focused day; again (after moving) adds a strip over it',
      },
      {
        id: 'calendar.new',
        action: 'New strip on the focused day (or the range)',
      },
      { keys: [['Esc']], action: 'Cancel the range / let go of the strip' },
      {
        keys: [['Drag']],
        action:
          'A strip: drag it to move it (touch: hold it first); click it, then drag its ends to resize it',
      },
      {
        keys: [['Right click']],
        action: 'A strip’s menu: edit, colour, delete (touch: hold it longer)',
      },
      {
        keys: [['Enter']],
        action: 'Edit the selected strip (or click it again)',
      },
      {
        id: 'calendar.delete',
        keys: [['Del']],
        action: 'Delete the selected strip (asks first)',
      },
      { keys: [[MOD_LABEL, 'Enter']], action: 'In the strip form: save' },
      {
        id: 'calendar.list',
        action: 'List every strip (go to, edit or delete one)',
      },
      {
        id: 'calendar.nextStrip',
        action: 'Next strip or task (Enter opens a task, selects a strip)',
      },
      { id: 'calendar.prevStrip', action: 'Previous strip or task' },
    ],
  },
  {
    title: 'Strip list',
    shortcuts: [
      { id: 'strips.down', keys: [['↓']], action: 'Next strip' },
      { id: 'strips.up', keys: [['↑']], action: 'Previous strip' },
      { id: 'strips.first', action: 'First strip' },
      { id: 'strips.last', action: 'Last strip' },
      { id: 'strips.go', keys: [['Enter']], action: 'Go to it in the month' },
      { id: 'strips.edit', action: 'Edit it' },
      { id: 'strips.delete', action: 'Delete it (asks first)' },
      {
        id: 'strips.filter',
        action: 'Filter by name (Esc back to the list)',
      },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      COMMON.globalSearch,
      COMMON.appSwitcher,
      COMMON.assistantPanel,
      COMMON.hideAssistant,
      COMMON.newChat,
      COMMON.theme,
      COMMON.profile,
      COMMON.toasts,
      COMMON.undoToast,
      COMMON.stopJarvis,
      COMMON.prevApp,
      COMMON.nextApp,
      COMMON.help,
      COMMON.confirm,
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
