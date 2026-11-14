import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserIcon,
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
import type { Contact } from '@/db/schema'
import type { FolderNode, Tree } from '@/lib/contacts/tree'
import { cn } from '@/lib/utils'
import type { OpenEditor } from './editor'
import { useRootDrop, useShiftItem, useTreeRowDnd } from './tree-dnd'

const INDENT_PX = 20
// Width of the chevron + gap, so contact icons line up with folder icons.
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
  /** Contact currently cut (keyboard `x`), shown dimmed until pasted. */
  cutId: number | null
}

export function ContactTree({ tree, ...props }: TreeProps & { tree: Tree }) {
  return (
    <div className="flex flex-col gap-2">
      <ul role="tree" className="flex flex-col">
        <Level
          folders={tree.folders}
          contacts={tree.contacts}
          depth={0}
          {...props}
        />
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
  contacts,
  depth,
  ...props
}: TreeProps & {
  folders: Array<FolderNode>
  contacts: Array<Contact>
  depth: number
}) {
  return (
    <>
      {folders.map((node) => (
        <FolderRow key={node.folder.id} node={node} depth={depth} {...props} />
      ))}
      {contacts.map((contact) => (
        <ContactRow
          key={contact.id}
          contact={contact}
          depth={depth}
          onEdit={props.onEdit}
          isCut={props.cutId === contact.id}
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
  const isEmpty = !node.folders.length && !node.contacts.length
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
            props.onEdit({
              kind: 'contact',
              mode: 'edit',
              folderId: folder.id,
            })
          }}
        >
          <PlusIcon />
          New contact here
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
            {node.contactCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {node.contactCount}
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
                contacts={node.contacts}
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

function ContactRow({
  contact,
  depth,
  onEdit,
  isCut,
}: {
  contact: Contact
  depth: number
  onEdit: OpenEditor
  isCut: boolean
}) {
  const item = { kind: 'contact', id: contact.id } as const
  const { rowProps, dropZone, isDragging, handle } = useTreeRowDnd(
    item,
    { kind: 'contact', contact },
    contact.name,
  )
  const indent = depth * INDENT_PX + CHEVRON_PX

  return (
    <RowContextMenu
      menu={<ContactMenuItems contact={contact} onEdit={onEdit} />}
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
        data-kind="contact"
        data-id={contact.id}
        data-parent-id={contact.folderId ?? ''}
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        onClick={() =>
          onEdit({ kind: 'contact', mode: 'view', contactId: contact.id })
        }
      >
        <UserIcon data-icon="inline-start" />
        <span className="truncate">{contact.name}</span>
        <span className="truncate text-muted-foreground">
          {contact.knownFrom || contact.phone || contact.email}
        </span>
      </Button>
      {handle}
      <ContactMenu contact={contact} onEdit={onEdit} />
    </RowContextMenu>
  )
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${what} copied`, type: 'success' })
  } catch {
    toast.add({ title: `Couldn't copy ${what.toLowerCase()}`, type: 'error' })
  }
}

/** A contact's hover `…` menu. */
function ContactMenu({
  contact,
  onEdit,
}: {
  contact: Contact
  onEdit: OpenEditor
}) {
  return (
    <RowMenu label={`Actions for ${contact.name}`}>
      <ContactMenuItems contact={contact} onEdit={onEdit} />
    </RowMenu>
  )
}

/** A contact's actions: in its hover menu and on right click / long press. */
function ContactMenuItems({
  contact,
  onEdit,
}: {
  contact: Contact
  onEdit: OpenEditor
}) {
  const shift = useShiftItem(
    { kind: 'contact', id: contact.id },
    contact.folderId,
  )

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() =>
            onEdit({ kind: 'contact', mode: 'view', contactId: contact.id })
          }
        >
          <UserIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onEdit({
              kind: 'contact',
              mode: 'edit',
              contact,
              folderId: contact.folderId,
            })
          }
        >
          <PencilIcon />
          Edit or move
        </DropdownMenuItem>
        {contact.phone && (
          <DropdownMenuItem onClick={() => copy(contact.phone, 'Phone')}>
            <CopyIcon />
            Copy phone
          </DropdownMenuItem>
        )}
        {contact.email && (
          <DropdownMenuItem onClick={() => copy(contact.email, 'Email')}>
            <CopyIcon />
            Copy email
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <ShiftItems shift={shift} />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onEdit({ kind: 'delete-contact', contact })}
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
