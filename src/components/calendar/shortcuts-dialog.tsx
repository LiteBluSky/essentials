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

// Keep in sync with the keys handled in routes/calendar.tsx.
const GROUPS: Array<{ title: string; shortcuts: Array<Shortcut> }> = [
  {
    title: 'Days',
    shortcuts: [
      { keys: [['h'], ['←']], action: 'Previous day' },
      { keys: [['l'], ['→']], action: 'Next day' },
      { keys: [['k'], ['↑']], action: 'Same day last week' },
      { keys: [['j'], ['↓']], action: 'Same day next week' },
      { keys: [['b'], ['Home']], action: 'Beginning of the week' },
      { keys: [['e'], ['End']], action: 'End of the week' },
      { keys: [['M'], ['PgUp']], action: 'Previous month' },
      { keys: [['m'], ['PgDn']], action: 'Next month' },
      { keys: [['t']], action: 'Today' },
      { keys: [['o']], action: 'Open the focused day’s tasks in Tasks' },
    ],
  },
  {
    title: 'Strips',
    shortcuts: [
      {
        keys: [['Enter'], ['Space']],
        action:
          'Start a range on the focused day; again (after moving) adds a strip over it',
      },
      { keys: [['a']], action: 'New strip on the focused day (or the range)' },
      { keys: [['Esc']], action: 'Cancel the range' },
      { keys: [['Ctrl', 'Enter']], action: 'In the strip form: save' },
      { keys: [['i']], action: 'List every strip (go to, edit or delete one)' },
    ],
  },
  {
    title: 'Strip list (i)',
    shortcuts: [
      { keys: [['j'], ['↓']], action: 'Next strip' },
      { keys: [['k'], ['↑']], action: 'Previous strip' },
      { keys: [['g', 'g'], ['G']], action: 'First / last strip' },
      { keys: [['Enter'], ['o']], action: 'Go to it in the month' },
      { keys: [['e']], action: 'Edit it' },
      { keys: [['d']], action: 'Delete it (d again confirms)' },
      { keys: [['/']], action: 'Filter by name (Esc back to the list)' },
      {
        keys: [['Drag']],
        action: 'With the mouse: drag over days (or click one) to add a strip',
      },
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
