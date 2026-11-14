import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  GlobeIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from 'lucide-react'

import { RowContextMenu } from '@/components/row-context-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import type { Link } from '@/db/schema'
import { hostname } from '@/lib/bookmarks/tree'
import type { FolderNode, Tree } from '@/lib/bookmarks/tree'
import { cn } from '@/lib/utils'
import type { OpenEditor } from './editor'
import { useRootDrop, useShiftItem, useTreeRowDnd } from './tree-dnd'

const INDENT_PX = 20
// Width of the chevron + gap, so link icons line up with folder icons.
const CHEVRON_PX = 22

// Drop indicator: a line above/below the row (inset to its indent), or a
// highlighted row when dropping inside a folder. Driven by `data-drop`.
const DROP_ROW = cn(
  'relative rounded-lg',
  'before:pointer-events-none before:absolute before:right-0 before:left-(--row-indent) before:h-0.5 before:rounded-full before:bg-primary before:opacity-0',
  'data-[drop=before]:before:-top-px data-[drop=before]:before:opacity-100',
  'data-[drop=after]:before:-bottom-px data-[drop=after]:before:opacity-100',
  'data-[drop=inside]:bg-accent data-dragging:opacity-50',
)

type TreeProps = {
  expanded: ReadonlySet<number>
  /** While searching every visible folder is forced open. */
  forceOpen: boolean
  onToggle: (id: number, open: boolean) => void
  onEdit: OpenEditor
  /** Link currently cut (keyboard `x`), shown dimmed until pasted. */
  cutId: number | null
  onToggleFavorite: (linkId: number) => void
}

export function BookmarkTree({ tree, ...props }: TreeProps & { tree: Tree }) {
  return (
    <div className="flex flex-col gap-2">
      <ul role="tree" className="flex flex-col">
        <Level folders={tree.folders} links={tree.links} depth={0} {...props} />
      </ul>
      <RootDropZone />
    </div>
  )
}

function RootDropZone() {
  const { visible, active, dropProps } = useRootDrop()
  if (!visible) return null
  return (
    <div
      {...dropProps}
      data-active={active || undefined}
      className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground data-active:border-primary data-active:bg-accent data-active:text-accent-foreground"
    >
      Drop here to move to the top level
    </div>
  )
}

function Level({
  folders,
  links,
  depth,
  ...props
}: TreeProps & {
  folders: Array<FolderNode>
  links: Array<Link>
  depth: number
}) {
  return (
    <>
      {folders.map((node) => (
        <FolderRow key={node.folder.id} node={node} depth={depth} {...props} />
      ))}
      {links.map((link) => (
        <LinkRow
          key={link.id}
          link={link}
          depth={depth}
          onEdit={props.onEdit}
          isCut={props.cutId === link.id}
          onToggleFavorite={props.onToggleFavorite}
        />
      ))}
    </>
  )
}

function FolderRow({
  node,
  depth,
  ...props
}: TreeProps & { node: FolderNode; depth: number }) {
  const { folder } = node
  const open = props.forceOpen || props.expanded.has(folder.id)
  const isEmpty = !node.folders.length && !node.links.length
  const item = { kind: 'folder', id: folder.id } as const
  const { rowProps, dropZone, isDragging, handle } = useTreeRowDnd(
    item,
    { kind: 'folder', node },
    folder.name,
  )
  const shift = useShiftItem(item, folder.parentId)
  const indent = depth * INDENT_PX
  // The hover menu's and the right click / long press menu's items.
  const menu = (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() => {
            props.onToggle(folder.id, true)
            props.onEdit({ kind: 'link', folderId: folder.id })
          }}
        >
          <PlusIcon />
          New link here
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            props.onToggle(folder.id, true)
            props.onEdit({ kind: 'folder', parentId: folder.id })
          }}
        >
          <FolderPlusIcon />
          New subfolder
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            props.onEdit({
              kind: 'folder',
              folder,
              parentId: folder.parentId,
            })
          }
        >
          <PencilIcon />
          Rename or move
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <ShiftItems shift={shift} />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => props.onEdit({ kind: 'delete-folder', node })}
        >
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  )

  return (
    <li role="treeitem" aria-expanded={open}>
      <Collapsible
        open={open}
        onOpenChange={(next) => props.onToggle(folder.id, next)}
      >
        <RowContextMenu
          menu={menu}
          render={
            <div
              {...rowProps}
              data-tree-row
              data-drop={dropZone}
              data-dragging={isDragging || undefined}
              className={cn('group/row flex items-center gap-1', DROP_ROW)}
              style={
                {
                  paddingLeft: indent,
                  '--row-indent': `${indent}px`,
                } as React.CSSProperties
              }
            />
          }
        >
          <CollapsibleTrigger
            data-tree-item
            data-kind="folder"
            data-id={folder.id}
            data-parent-id={folder.parentId ?? ''}
            render={
              <Button
                variant="ghost"
                className="min-w-0 flex-1 justify-start"
              />
            }
          >
            {open ? (
              <ChevronDownIcon data-icon="inline-start" />
            ) : (
              <ChevronRightIcon data-icon="inline-start" />
            )}
            {open ? <FolderOpenIcon /> : <FolderIcon />}
            <span className="truncate">{folder.name}</span>
            {node.linkCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {node.linkCount}
              </Badge>
            )}
          </CollapsibleTrigger>
          {handle}
          <RowMenu label={`Actions for ${folder.name}`}>{menu}</RowMenu>
        </RowContextMenu>
        <CollapsibleContent>
          <ul role="group" className="flex flex-col">
            {isEmpty ? (
              <li
                className="py-1.5 text-sm text-muted-foreground"
                style={{
                  paddingLeft: (depth + 1) * INDENT_PX + CHEVRON_PX + 10,
                }}
              >
                Empty
              </li>
            ) : (
              <Level
                folders={node.folders}
                links={node.links}
                depth={depth + 1}
                {...props}
              />
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function LinkRow({
  link,
  depth,
  onEdit,
  isCut,
  onToggleFavorite,
}: {
  link: Link
  depth: number
  onEdit: OpenEditor
  isCut: boolean
  onToggleFavorite: (linkId: number) => void
}) {
  const isFavorite = link.favoritePosition !== null
  const item = { kind: 'link', id: link.id } as const
  const { rowProps, dropZone, isDragging, handle } = useTreeRowDnd(
    item,
    { kind: 'link', link },
    link.url,
  )
  const indent = depth * INDENT_PX + CHEVRON_PX

  return (
    <RowContextMenu
      menu={
        <LinkMenuItems
          link={link}
          onEdit={onEdit}
          onToggleFavorite={onToggleFavorite}
        />
      }
      render={
        <li
          role="treeitem"
          {...rowProps}
          data-tree-row
          data-drop={dropZone}
          data-dragging={isDragging || undefined}
          data-cut={isCut || undefined}
          className={cn(
            'group/row flex items-center gap-1 data-cut:opacity-50',
            DROP_ROW,
          )}
          style={
            {
              paddingLeft: indent,
              '--row-indent': `${indent}px`,
            } as React.CSSProperties
          }
        />
      }
    >
      <Button
        data-tree-item
        data-kind="link"
        data-id={link.id}
        data-parent-id={link.folderId ?? ''}
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        nativeButton={false}
        render={
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            title={link.description ?? link.url}
          />
        }
      >
        <GlobeIcon data-icon="inline-start" />
        <span className="truncate">{link.title}</span>
        <span className="truncate text-muted-foreground">
          {hostname(link.url)}
        </span>
        {isFavorite && (
          <StarIcon
            aria-label="Favourite"
            className="ml-auto fill-current text-muted-foreground"
          />
        )}
      </Button>
      {handle}
      <LinkMenu
        link={link}
        onEdit={onEdit}
        onToggleFavorite={onToggleFavorite}
      />
    </RowContextMenu>
  )
}

/** A link's hover `…` menu (tree rows and the favourites list). */
export function LinkMenu({
  link,
  onEdit,
  onToggleFavorite,
}: {
  link: Link
  onEdit: OpenEditor
  onToggleFavorite: (linkId: number) => void
}) {
  return (
    <RowMenu label={`Actions for ${link.title}`}>
      <LinkMenuItems
        link={link}
        onEdit={onEdit}
        onToggleFavorite={onToggleFavorite}
      />
    </RowMenu>
  )
}

/** A link's actions: in its hover menu and on right click / long press. */
export function LinkMenuItems({
  link,
  onEdit,
  onToggleFavorite,
}: {
  link: Link
  onEdit: OpenEditor
  onToggleFavorite: (linkId: number) => void
}) {
  const isFavorite = link.favoritePosition !== null
  const shift = useShiftItem({ kind: 'link', id: link.id }, link.folderId)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      toast.add({ title: 'URL copied', type: 'success' })
    } catch {
      toast.add({ title: "Couldn't copy URL", type: 'error' })
    }
  }

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() =>
            onEdit({ kind: 'link', link, folderId: link.folderId })
          }
        >
          <PencilIcon />
          Edit or move
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copy}>
          <CopyIcon />
          Copy URL
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggleFavorite(link.id)}>
          {isFavorite ? <StarOffIcon /> : <StarIcon />}
          {isFavorite ? 'Remove from favourites' : 'Add to favourites'}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <ShiftItems shift={shift} />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onEdit({ kind: 'delete-link', link })}
        >
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  )
}

function ShiftItems({
  shift,
}: {
  shift: { up?: () => void; down?: () => void }
}) {
  if (!shift.up && !shift.down) return null
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem disabled={!shift.up} onClick={shift.up}>
          <ArrowUpIcon />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!shift.down} onClick={shift.down}>
          <ArrowDownIcon />
          Move down
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  )
}

function RowMenu({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
