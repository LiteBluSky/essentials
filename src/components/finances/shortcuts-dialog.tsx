import { Fragment } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { NEW_CHAT_KEYS } from '@/lib/shortcuts'

// Each entry: alternative key combos (joined with "or"), each a list of keys
// pressed together or in sequence.
type Shortcut = { keys: Array<Array<string>>; action: string }

// Keep in sync with the keys handled in routes/finances.tsx.
const GROUPS: Array<{ title: string; shortcuts: Array<Shortcut> }> = [
  {
    title: 'Money',
    shortcuts: [
      {
        keys: [['a']],
        action: 'Add money out / in (−/+ in front of the amount switches)',
      },
      { keys: [['Enter']], action: 'In the pop-up: save it' },
      { keys: [['M']], action: 'Previous month' },
      { keys: [['m']], action: 'Next month' },
      { keys: [['t']], action: 'This month' },
      { keys: [['u']], action: 'Recurring (bills, subscriptions, income)' },
      { keys: [['b']], action: 'Budgets' },
      { keys: [['r']], action: 'Ask for advice (Jarvis)' },
      { keys: [['Ctrl', 'Enter']], action: 'In a form: save' },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: [['z']], action: 'Search everything (all apps)' },
      { keys: [['f']], action: 'Switch app (type its name, or pick it)' },
      {
        keys: [['s']],
        action: `Open the ${ASSISTANT_NAME} panel and type (wide screens)`,
      },
      {
        keys: [['Shift', 'S']],
        action: `Hide the ${ASSISTANT_NAME} panel (wide screens)`,
      },
      {
        keys: [NEW_CHAT_KEYS],
        action: `New chat with ${ASSISTANT_NAME}`,
      },
      { keys: [['Shift', 'T']], action: 'Next theme (light, dark, system)' },
      { keys: [['p']], action: 'Switch profile (database)' },
      { keys: [['Shift', 'H']], action: 'Previous app' },
      { keys: [['Shift', 'L']], action: 'Next app' },
      { keys: [['?']], action: 'Show keyboard shortcuts' },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These are off while typing or while a dialog is open.
          </DialogDescription>
        </DialogHeader>
        {GROUPS.map((group) => (
          <Table key={group.title}>
            <TableHeader>
              <TableRow>
                <TableHead>{group.title}</TableHead>
                <TableHead className="text-right">Keys</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.shortcuts.map(({ keys, action }) => (
                <TableRow key={action}>
                  {/* Wrap the action so the keys always fit (no sideways scroll). */}
                  <TableCell className="whitespace-normal">{action}</TableCell>
                  <TableCell className="w-px text-right">
                    <KbdGroup className="justify-end">
                      {keys.map((combo, i) => (
                        <Fragment key={combo.join('+')}>
                          {i > 0 && (
                            <span className="text-muted-foreground">or</span>
                          )}
                          {combo.map((key, j) => (
                            <Kbd key={j}>{key}</Kbd>
                          ))}
                        </Fragment>
                      ))}
                    </KbdGroup>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
      </DialogContent>
    </Dialog>
  )
}
