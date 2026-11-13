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
        action: 'Add: type the amount and what it was (“12.50 coffee”)',
      },
      { keys: [['+']], action: 'In the field: start with + for income' },
      { keys: [['Enter']], action: 'In the field: save it' },
      { keys: [['Esc']], action: 'Leave the field' },
      { keys: [['M']], action: 'Previous month' },
      { keys: [['m']], action: 'Next month' },
      { keys: [['t']], action: 'This month' },
      { keys: [['u']], action: 'Subscriptions' },
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
