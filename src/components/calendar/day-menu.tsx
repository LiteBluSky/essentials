import { Menu } from '@base-ui/react/menu'
import { format } from 'date-fns'
import {
  CalendarRangeIcon,
  ListChecksIcon,
  SquareCheckIcon,
} from 'lucide-react'
import { useMemo } from 'react'

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { parseDay } from '@/lib/calendar/layout'

/** A day's menu, and where it was asked for (viewport coordinates). */
export type DayMenuAt = { day: string; x: number; y: number }

/**
 * What can be done on a day: a new strip or a new task (due that day), or
 * that day's tasks in Tasks. Opened by right click / a long press on the
 * day, and when one day is picked (a click, a second tap on the same day,
 * Enter twice), so the user chooses between a strip and a task. Base UI's
 * menu primitives anchored at the point, like the strip menu; the items
 * are shadcn's.
 */
export function DayMenu({
  at,
  onClose,
  onNewStrip,
  onNewTask,
  onShowTasks,
}: {
  at: DayMenuAt | null
  onClose: () => void
  onNewStrip: (day: string) => void
  onNewTask: (day: string) => void
  onShowTasks: (day: string) => void
}) {
  const anchor = useMemo(
    () =>
      at && {
        getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0),
      },
    [at],
  )
  return (
    <Menu.Root
      open={at !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={4}
          className="isolate z-50 outline-none"
        >
          <Menu.Popup className="z-50 max-h-(--available-height) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {at && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {format(parseDay(at.day), 'EEEE d MMMM')}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onNewStrip(at.day)}>
                    <CalendarRangeIcon />
                    New strip…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onNewTask(at.day)}>
                    <SquareCheckIcon />
                    New task…
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onShowTasks(at.day)}>
                    <ListChecksIcon />
                    That day’s tasks
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
