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

// Each entry: alternative key combos (joined with "or"), each a list of keys
// pressed together or in sequence.
type Shortcut = { keys: Array<Array<string>>; action: string }

// Keep in sync with the keys handled in routes/chat.tsx and chat-thread.tsx.
const GROUPS: Array<{ title: string; shortcuts: Array<Shortcut> }> = [
  {
    title: 'Conversations',
    shortcuts: [
      { keys: [['j'], ['↓']], action: 'Next (older) conversation' },
      { keys: [['k'], ['↑']], action: 'Previous (newer) conversation' },
      { keys: [['g', 'g']], action: 'Latest conversation' },
      { keys: [['G']], action: 'Oldest conversation' },
      { keys: [['a']], action: 'New chat' },
      {
        keys: [['d'], ['Del']],
        action: 'Delete the open conversation (d again confirms)',
      },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: [['s']], action: `Message ${ASSISTANT_NAME}` },
      { keys: [['z']], action: 'Search everything (all apps)' },
      { keys: [['f']], action: 'Switch app (type its name, or pick it)' },
      { keys: [['p']], action: 'Switch profile (database)' },
      {
        keys: [['@']],
        action: 'In the message box: link to a bookmark, note, task or contact',
      },
      { keys: [['Shift', 'H']], action: 'Previous app' },
      { keys: [['Shift', 'L']], action: 'Next app' },
      { keys: [['?']], action: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Message box',
    shortcuts: [
      { keys: [['Enter']], action: 'Send' },
      { keys: [['Shift', 'Enter']], action: 'New line' },
      { keys: [['Esc']], action: 'Leave the box (the keys above work again)' },
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
            These are off while typing in the message box or while a dialog is
            open.
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
