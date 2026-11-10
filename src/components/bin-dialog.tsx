import { RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { binExpiry } from '@/lib/bin'

export type BinEntry = {
  id: number
  label: string
  // Where it was ('' = top level).
  path: string
  deletedAt: Date
}

// An app's bin (from its ⋮ menu): what was deleted in the last day, each with
// restore / delete forever, and "Empty bin". Shared by the apps; each wires
// in its own query and mutations.
export function BinDialog({
  open,
  onOpenChange,
  noun,
  entries,
  busy,
  onRestore,
  onDelete,
  onEmpty,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // 'link' / 'note'
  noun: string
  entries: Array<BinEntry> | undefined
  busy: boolean
  onRestore: (id: number) => void
  onDelete: (id: number) => void
  onEmpty: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bin</DialogTitle>
          <DialogDescription>
            Deleted {noun}s are kept here for a day, then removed for good.
          </DialogDescription>
        </DialogHeader>
        {!entries ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : !entries.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trash2Icon />
              </EmptyMedia>
              <EmptyTitle>The bin is empty</EmptyTitle>
              <EmptyDescription>
                Nothing deleted in the last day.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="-mx-1 flex max-h-[60vh] flex-col overflow-y-auto">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-muted/50"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{entry.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.path || 'Top level'} · gone in{' '}
                    {binExpiry(entry.deletedAt)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRestore(entry.id)}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete forever"
                  title="Delete forever"
                  disabled={busy}
                  onClick={() => onDelete(entry.id)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            disabled={busy || !entries?.length}
            onClick={onEmpty}
          >
            <Trash2Icon data-icon="inline-start" />
            Empty bin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
