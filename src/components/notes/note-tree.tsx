import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

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
import type { Note } from '@/db/schema'
import { noteLabel, noteSnippet } from '@/lib/notes/tree'
import type { FolderNode, Tree } from '@/lib/notes/tree'
import { cn } from '@/lib/utils'
import type { OpenEditor } from './editor'
import { useRootDrop, useShiftItem, useTreeRowDnd } from './tree-dnd'

const INDENT_PX = 20
// Width of the chevron + gap, so note icons line up with folder icons.
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
  /** Note currently cut (keyboard `x`), shown dimmed until pasted. */
  cutId: number | null
}

export function NoteTree({ tree, ...props }: TreeProps & { tree: Tree }) {
  return (
    <div className="flex flex-col gap-2">
      <ul role="tree" className="flex flex-col">
        <Level folders={tree.folders} notes={tree.notes} depth={0} {...props} />
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
  notes,
  depth,
  ...props
}: TreeProps & {
  folders: Array<FolderNode>
  notes: Array<Note>
  depth: number
}) {
  return (
    <>
      {folders.map((node) => (
        <FolderRow key={node.folder.id} node={node} depth={depth} {...props} />
      ))}
      {notes.map((note) => (
        <NoteRow
          key={note.id}
          note={note}
          depth={depth}
          onEdit={props.onEdit}
          isCut={props.cutId === note.id}
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
  const isEmpty = !node.folders.length && !node.notes.length
  const item = { kind: 'folder', id: folder.id } as const
  const { rowProps, dropZone, isDragging } = useTreeRowDnd(
    item,
    { kind: 'folder', node },
    folder.name,
  )
  const shift = useShiftItem(item, folder.parentId)
  const indent = depth * INDENT_PX

  return (
    <li role="treeitem" aria-expanded={open}>
      <Collapsible
        open={open}
        onOpenChange={(next) => props.onToggle(folder.id, next)}
      >
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
            {node.noteCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {node.noteCount}
              </Badge>
            )}
          </CollapsibleTrigger>
          <RowMenu label={`Actions for ${folder.name}`}>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  props.onToggle(folder.id, true)
                  props.onEdit({
                    kind: 'note',
                    mode: 'edit',
                    folderId: folder.id,
                  })
                }}
              >
                <PlusIcon />
                New note here
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
          </RowMenu>
        </div>
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
                notes={node.notes}
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

function NoteRow({
  note,
  depth,
  onEdit,
  isCut,
}: {
  note: Note
  depth: number
  onEdit: OpenEditor
  isCut: boolean
}) {
  const item = { kind: 'note', id: note.id } as const
  const { rowProps, dropZone, isDragging } = useTreeRowDnd(
    item,
    { kind: 'note', note },
    noteLabel(note),
  )
  const indent = depth * INDENT_PX + CHEVRON_PX

  return (
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
    >
      <Button
        data-tree-item
        data-kind="note"
        data-id={note.id}
        data-parent-id={note.folderId ?? ''}
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        title={noteSnippet(note.body) || undefined}
        onClick={() => onEdit({ kind: 'note', mode: 'view', noteId: note.id })}
      >
        <FileTextIcon data-icon="inline-start" />
        <span className="truncate">{noteLabel(note)}</span>
        {note.title && (
          <span className="truncate text-muted-foreground">
            {noteSnippet(note.body, 80)}
          </span>
        )}
      </Button>
      <NoteMenu note={note} onEdit={onEdit} />
    </li>
  )
}

/** A note's hover `…` menu (tree rows and the recent / most viewed lists). */
export function NoteMenu({ note, onEdit }: { note: Note; onEdit: OpenEditor }) {
  const shift = useShiftItem({ kind: 'note', id: note.id }, note.folderId)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.body)
      toast.add({ title: 'Text copied', type: 'success' })
    } catch {
      toast.add({ title: "Couldn't copy text", type: 'error' })
    }
  }

  return (
    <RowMenu label={`Actions for ${noteLabel(note)}`}>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() =>
            onEdit({ kind: 'note', mode: 'view', noteId: note.id })
          }
        >
          <EyeIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onEdit({
              kind: 'note',
              mode: 'edit',
              note,
              folderId: note.folderId,
            })
          }
        >
          <PencilIcon />
          Edit or move
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copy} disabled={!note.body}>
          <CopyIcon />
          Copy text
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <ShiftItems shift={shift} />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onEdit({ kind: 'delete-note', note })}
        >
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </RowMenu>
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
