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
import { MOD_LABEL, SHORTCUTS } from '@/lib/shortcuts'

// Each entry: alternative key combos (joined with "or"), each a list of keys
// pressed together or in sequence.
type Shortcut = { keys: Array<Array<string>>; action: string }

const mod = (key: string) => [MOD_LABEL, key]

const GROUPS: Array<{ title: string; shortcuts: Array<Shortcut> }> = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: [mod(SHORTCUTS.search.label), ['/']], action: 'Search this app' },
      { keys: [['z']], action: 'Search everything (all apps)' },
      {
        keys: [['s']],
        action: 'Tell me… (new task or note; Esc goes back)',
      },
      {
        keys: [['a']],
        action: 'New task',
      },
      { keys: [mod(SHORTCUTS.newFolder.label)], action: 'New folder' },
      { keys: [['1'], ['…'], ['9']], action: 'Open an “Up next” task' },
      { keys: [['t']], action: 'Show completed / open tasks' },
      { keys: [['v']], action: 'Folders / one list' },
      { keys: [['i']], action: 'Calendar of the month' },
      {
        keys: [['Shift', 'H']],
        action: 'Collapse all folders, then previous app',
      },
      { keys: [['Shift', 'L']], action: 'Next app' },
      { keys: [['?']], action: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Tree',
    shortcuts: [
      { keys: [['j'], ['↓']], action: 'Next row' },
      { keys: [['k'], ['↑']], action: 'Previous row' },
      { keys: [['h'], ['←']], action: 'Collapse folder / go to parent' },
      { keys: [['l'], ['→']], action: 'Expand folder / into first child' },
      { keys: [['g', 'g']], action: 'First row' },
      { keys: [['G']], action: 'Last row' },
      { keys: [['n']], action: 'Next task' },
      { keys: [['Shift', 'N']], action: 'Previous task' },
      { keys: [['o'], ['Enter']], action: 'Open task / toggle folder' },
      { keys: [['a']], action: 'New task in hovered or focused folder' },
      { keys: [['c']], action: 'Complete / reopen hovered or focused task' },
      { keys: [['e'], ['r']], action: 'Edit task / rename folder' },
      {
        keys: [['d'], ['Del']],
        action: 'Delete hovered or focused row (d again confirms)',
      },
      { keys: [['x']], action: 'Cut task' },
      { keys: [['p']], action: 'Paste cut task here' },
      { keys: [['Esc']], action: 'Cancel cut' },
      { keys: [['q']], action: 'Clear search and date filter' },
    ],
  },
  {
    title: 'Open task',
    shortcuts: [
      { keys: [['c']], action: 'Complete / reopen' },
      { keys: [['e']], action: 'Edit' },
      { keys: [['d'], ['Del']], action: 'Delete (d again confirms)' },
      { keys: [['Esc']], action: 'Close' },
    ],
  },
  {
    title: 'Task form',
    shortcuts: [
      { keys: [['Enter']], action: 'Save (from the task field)' },
      { keys: [mod('Enter')], action: 'Save (from the description)' },
      { keys: [['Esc']], action: 'Cancel' },
    ],
  },
  {
    title: 'Due date picker and calendar',
    shortcuts: [
      { keys: [['h'], ['l']], action: 'Previous / next day' },
      { keys: [['k'], ['j']], action: 'Previous / next week' },
      { keys: [['m'], ['Shift', 'M']], action: 'Next / previous month' },
      { keys: [['y'], ['Shift', 'Y']], action: 'Next / previous year' },
      { keys: [['Enter']], action: 'Pick the date (calendar: show its tasks)' },
      { keys: [['a']], action: 'Calendar: new task due that day' },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Tree keys are off while typing in a field or while a dialog is open.
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
