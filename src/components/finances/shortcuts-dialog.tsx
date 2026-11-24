import { COMMON, ShortcutsHelp } from '@/components/shortcuts-dialog'
import type { ShortcutGroup } from '@/components/shortcuts-dialog'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { MOD_LABEL } from '@/lib/shortcuts'

// Finances' shortcuts, as shown (and changed) in the shared dialog
// (components/shortcuts-dialog.tsx). Rows with an `id` are shortcuts from
// lib/shortcuts.ts: the dialog shows the key each is on now; `keys` are
// fixed ones. Keep it in sync when adding or changing a shortcut.

const GROUPS: Array<ShortcutGroup> = [
  {
    title: 'Money',
    shortcuts: [
      {
        id: 'finances.add',
        action: 'Add money out / in (−/+ in front of the amount switches)',
      },
      { keys: [['Enter']], action: 'In the pop-up: save it' },
      { id: 'finances.prevMonth', action: 'Previous month (Month tab)' },
      { id: 'finances.nextMonth', action: 'Next month (Month tab)' },
      { id: 'finances.thisMonth', action: 'This month (Month tab)' },
      {
        id: 'finances.recurring',
        action: 'Recurring tab (bills, subscriptions, income)',
      },
      { id: 'finances.budgets', action: 'Budgets tab' },
      { id: 'finances.savings', action: 'Savings tab' },
      {
        id: 'finances.advice',
        action: `Ask for advice (${ASSISTANT_NAME})`,
      },
      { keys: [[MOD_LABEL, 'Enter']], action: 'In a form: save' },
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
