import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

/**
 * A row's actions on right click (desktop) or a long press (touch, ~0.5 s):
 * the same items as its hover `…` menu, opened where it was pressed.
 * `render` is the row's own element (it becomes the trigger, keeping its
 * props: drag and drop, `data-tree-row`…), `children` what's inside it,
 * `menu` the items (`DropdownMenuGroup` / `DropdownMenuItem` /
 * `DropdownMenuSeparator`: Base UI's context menu and dropdown share those
 * parts, so the hover menu's items are used as they are).
 */
export function RowContextMenu({
  render,
  menu,
  children,
}: {
  render: React.ReactElement
  menu: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={render}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">{menu}</ContextMenuContent>
    </ContextMenu>
  )
}
