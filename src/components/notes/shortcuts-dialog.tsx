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
      { keys: [mod(SHORTCUTS.newFolder.label)], action: 'New folder' },
      { keys: [['1'], ['…'], ['4']], action: 'Open recent note 1–4' },
      { keys: [['5'], ['…'], ['8']], action: 'Open most viewed note 5–8' },
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
      { keys: [['n']], action: 'Next note' },
      { keys: [['Shift', 'N']], action: 'Previous note' },
      { keys: [['o'], ['Enter']], action: 'Open note / toggle folder' },
      { keys: [['e'], ['r']], action: 'Edit note / rename folder' },
      { keys: [['a']], action: 'New note in hovered or focused folder' },
      { keys: [['d']], action: 'Delete hovered or focused row' },
      { keys: [['x']], action: 'Cut note' },
      { keys: [['p']], action: 'Paste cut note here' },
      { keys: [['Esc']], action: 'Cancel cut' },
      { keys: [['q']], action: 'Clear search' },
    ],
  },
  {
    title: 'Open note',
    shortcuts: [
      { keys: [['e']], action: 'Edit' },
      { keys: [['d']], action: 'Delete' },
      { keys: [mod('P')], action: 'Export as PDF' },
      { keys: [['Esc']], action: 'Close' },
    ],
  },
  {
    title: 'Writing',
    shortcuts: [
      { keys: [mod('Enter'), mod('S')], action: 'Save and show the note' },
      { keys: [['Esc']], action: 'Save and close' },
      { keys: [mod('B')], action: 'Bold' },
      { keys: [mod('I')], action: 'Italic' },
      { keys: [mod('K')], action: 'Link' },
      { keys: [mod('M')], action: 'Format the line: pick from the toolbar' },
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
