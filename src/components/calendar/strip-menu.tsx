import { Menu } from '@base-ui/react/menu'
import { PaletteIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import type { CalendarEvent } from '@/db/schema'
import { CALENDAR_COLORS } from '@/lib/calendar/colors'
import type { CalendarColor } from '@/lib/calendar/colors'
import { cn } from '@/lib/utils'

/** Where a strip's menu was asked for (viewport coordinates). */
export type StripMenuAt = { id: number; x: number; y: number }

/**
 * A strip's actions, opened where it was right-clicked (or held, on touch):
 * Edit, Colour, Delete. Base UI's menu primitives rather than shadcn's
 * `DropdownMenuContent` / `ContextMenu`, because it's opened from code at a
 * point (the hold is timed by the grid: a shorter one grabs the strip), which
 * needs the positioner's `anchor`; the items are shadcn's.
 */
export function StripMenu({
  at,
  event,
  onClose,
  onEdit,
  onColor,
  onDelete,
}: {
  at: StripMenuAt | null
  event: CalendarEvent | null
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
  onColor: (event: CalendarEvent, color: CalendarColor) => void
  onDelete: (event: CalendarEvent) => void
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
      open={at !== null && event !== null}
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
          <Menu.Popup className="z-50 max-h-(--available-height) min-w-40 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {event && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onEdit(event)}>
                    <PencilIcon />
                    Edit…
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <PaletteIcon />
                      Colour
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuGroup className="grid grid-cols-5 gap-0.5">
                        {CALENDAR_COLORS.map((color) => (
                          <DropdownMenuItem
                            key={color.key}
                            aria-label={color.label}
                            title={color.label}
                            className="justify-center p-1.5"
                            onClick={() => onColor(event, color.key)}
                          >
                            <span
                              className={cn(
                                'size-5 rounded-full',
                                color.className,
                                color.key === event.color &&
                                  'ring-2 ring-ring ring-offset-2 ring-offset-popover',
                              )}
                            />
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(event)}
                  >
                    <Trash2Icon />
                    Delete
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
