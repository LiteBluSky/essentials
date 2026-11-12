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
        keys: [['@']],
        action: 'In a text box: link to a bookmark, note, task or contact',
      },
      {
        keys: [['s']],
        action: 'Tell me… (new task or note; Esc goes back)',
      },
      { keys: [mod(SHORTCUTS.newFolder.label)], action: 'New folder' },
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
      { keys: [['n']], action: 'Next contact' },
      { keys: [['Shift', 'N']], action: 'Previous contact' },
      { keys: [['o'], ['Enter']], action: 'Show contact / toggle folder' },
      { keys: [['r']], action: 'Edit (rename / move)' },
      { keys: [['a']], action: 'New contact in hovered or focused folder' },
      {
        keys: [['d']],
        action: 'Delete hovered or focused row (d again confirms)',
      },
      { keys: [['x']], action: 'Cut contact' },
      { keys: [['p']], action: 'Paste cut contact here' },
      { keys: [['Esc']], action: 'Cancel cut' },
      { keys: [['q']], action: 'Clear search' },
    ],
  },
  {
    title: 'Contact details',
    shortcuts: [
      { keys: [['e']], action: 'Edit' },
      { keys: [['d']], action: 'Delete (d again confirms)' },
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
            Off while typing in a field or while a dialog is open.
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
