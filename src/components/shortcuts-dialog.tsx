import { RotateCcwIcon } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  SHORTCUT_DEFS,
  comboOf,
  comboParts,
  conflictsOf,
  resetBinding,
  resetBindings,
  setBinding,
  useBindings,
} from '@/lib/shortcuts'
import type { ShortcutId } from '@/lib/shortcuts'

// The shortcuts help of every app, and where the keys are changed: a row
// with an `id` shows the key that shortcut is on now as a button (click it,
// press the new key; Esc cancels; the arrow puts the default back). Each
// app's `shortcuts-dialog.tsx` only lists its groups.

/** A row: a shortcut that can be changed (`id`), and / or fixed keys shown
 * after it (`keys`: alternative combos, each a list of keys). */
export type ShortcutRow = {
  id?: ShortcutId
  keys?: Array<Array<string>>
  action: string
}
export type ShortcutGroup = { title: string; shortcuts: Array<ShortcutRow> }

/** The rows every app shares ("Anywhere"). */
export const COMMON = {
  globalSearch: {
    id: 'global.globalSearch',
    action: 'Search everything (all apps)',
  },
  appSwitcher: {
    id: 'global.appSwitcher',
    action: 'Switch app (type its name, or pick it)',
  },
  theme: { id: 'global.theme', action: 'Next theme (light, dark, system)' },
  profile: { id: 'global.profile', action: 'Switch profile (database)' },
  reference: {
    keys: [['@']],
    action: 'In a text box: link to a bookmark, note, task or contact',
  },
  assistant: {
    id: 'global.assistant',
    action: `Ask ${ASSISTANT_NAME}… (tasks, notes, questions; ↑/↓ past requests; Esc goes back, or stops a request)`,
  },
  assistantPanel: {
    id: 'global.assistant',
    action: `Open the ${ASSISTANT_NAME} panel and type (wide screens)`,
  },
  hideAssistant: {
    id: 'global.hideAssistant',
    action: `Hide the ${ASSISTANT_NAME} panel (wide screens)`,
  },
  newChat: { id: 'global.newChat', action: `New chat with ${ASSISTANT_NAME}` },
  prevApp: { id: 'global.prevApp', action: 'Previous app' },
  nextApp: { id: 'global.nextApp', action: 'Next app' },
  help: { id: 'global.help', action: 'Show keyboard shortcuts' },
  confirm: {
    id: 'global.confirm',
    action: 'In a “Delete?” question: yes, delete',
  },
} satisfies Record<string, ShortcutRow>

/** Keys that can't be a shortcut: they move around the dialog itself. */
const RESERVED = new Set(['Tab', 'Shift+Tab', 'Enter', 'Escape'])

export function ShortcutsHelp({
  open,
  onOpenChange,
  groups,
  description = 'Keys are off while typing in a field or while a dialog is open.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: Array<ShortcutGroup>
  description?: string
}) {
  const changed = useBindings()
  /** The shortcut waiting for its new key. */
  const [capturing, setCapturing] = useState<ShortcutId | null>(null)
  useEffect(() => {
    if (!open) setCapturing(null)
  }, [open])

  // While one waits, the next key press is its new key (before anything
  // else hears it: Esc then cancels this, not the dialog).
  useEffect(() => {
    if (!capturing) return
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = comboOf(e)
      if (combo === null) return // A modifier on its own: keep waiting.
      e.preventDefault()
      e.stopImmediatePropagation()
      if (combo === 'Escape') setCapturing(null)
      else if (!RESERVED.has(combo)) {
        setBinding(capturing, combo)
        setCapturing(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing])

  const anyChanged = Object.keys(changed).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {description} Click a key to change it, then press the new one (kept
            in this browser).
          </DialogDescription>
        </DialogHeader>
        {groups.map((group) => (
          <Table key={group.title}>
            <TableHeader>
              <TableRow>
                <TableHead>{group.title}</TableHead>
                <TableHead className="text-right">Keys</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.shortcuts.map(({ id, keys = [], action }) => {
                const def = id ? SHORTCUT_DEFS[id] : null
                const clashes = id ? conflictsOf(id, changed) : []
                return (
                  <TableRow key={action}>
                    {/* Wrap the action so the keys always fit (no sideways scroll). */}
                    <TableCell className="whitespace-normal">
                      {action}
                      {clashes.length > 0 && (
                        <span className="block text-xs text-destructive">
                          Same key as:{' '}
                          {clashes
                            .map((other) => SHORTCUT_DEFS[other].label)
                            .join(', ')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="w-px text-right">
                      <KbdGroup className="justify-end">
                        {id && def && (
                          <>
                            {id in changed && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Back to the default key for “${action}”`}
                                title="Back to the default"
                                onClick={() => resetBinding(id)}
                              >
                                <RotateCcwIcon />
                              </Button>
                            )}
                            <Button
                              variant={capturing === id ? 'default' : 'outline'}
                              size="xs"
                              aria-label={`Change the key for “${action}”`}
                              title="Click, then press the new key"
                              onClick={() =>
                                setCapturing(capturing === id ? null : id)
                              }
                            >
                              {capturing === id
                                ? 'Press a key…'
                                : comboParts(
                                    changed[id] ?? def.keys,
                                    def.twice,
                                  ).map((key, i) => <Kbd key={i}>{key}</Kbd>)}
                            </Button>
                          </>
                        )}
                        {keys.map((combo, i) => (
                          <Fragment key={combo.join('+')}>
                            {(i > 0 || id) && (
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
                )
              })}
            </TableBody>
          </Table>
        ))}
        {anyChanged && (
          <DialogFooter>
            <Button variant="outline" onClick={() => resetBindings()}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset all keys to the defaults
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
