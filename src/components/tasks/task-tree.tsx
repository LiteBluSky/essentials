import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  EyeIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { Task } from '@/db/schema'
import { useHydrated } from '@/hooks/use-hydrated'
import { ageLabel, dueLabel, taskTone } from '@/lib/tasks/tree'
import type { FolderNode, TaskTone, Tree } from '@/lib/tasks/tree'
import { cn } from '@/lib/utils'
import type { OpenEditor } from './editor'
import { useRootDrop, useShiftItem, useTreeRowDnd } from './tree-dnd'

const INDENT_PX = 20
// Width of the chevron + gap, so task checkboxes line up with folder icons.
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

// Red after 3 days, yellow after 1, green once done.
const CHECK_TONE: Record<TaskTone, string> = {
  overdue: 'border-destructive',
  due: 'border-warning',
  done: 'data-checked:border-success data-checked:bg-success dark:data-checked:bg-success',
  fresh: '',
}
const AGE_TONE: Record<TaskTone, string> = {
  overdue: 'text-destructive',
  due: 'text-warning',
  done: 'text-success',
  fresh: 'text-muted-foreground',
}

type TaskActions = {
  onEdit: OpenEditor
  /** Complete an open task / reopen a done one. */
  onComplete: (taskId: number) => void
}

type TreeProps = TaskActions & {
  expanded: ReadonlySet<number>
  /** While searching every visible folder is forced open. */
  forceOpen: boolean
  onToggle: (id: number, open: boolean) => void
  /** Task currently cut (keyboard `x`), shown dimmed until pasted. */
  cutId: number | null
}

/** Tasks grouped in their folders (the `v` toggle's "Folders"). */
export function TaskTree({ tree, ...props }: TreeProps & { tree: Tree }) {
  return (
    <div className="flex flex-col gap-2">
      <ul role="tree" className="flex flex-col">
        <Level folders={tree.folders} tasks={tree.tasks} depth={0} {...props} />
      </ul>
      <RootDropZone />
    </div>
  )
}

/** Every task without folders (the `v` toggle's "List"), each with its
 * folder path. */
export function TaskList({
  tasks,
  pathOf,
  cutId,
  ...actions
}: TaskActions & {
  tasks: Array<Task>
  pathOf: (folderId: number | null) => string
  cutId: number | null
}) {
  return (
    <ul role="tree" className="flex flex-col">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          depth={0}
          path={pathOf(task.folderId)}
          isCut={cutId === task.id}
          {...actions}
        />
      ))}
    </ul>
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
  tasks,
  depth,
  ...props
}: TreeProps & {
  folders: Array<FolderNode>
  tasks: Array<Task>
  depth: number
}) {
  return (
    <>
      {folders.map((node) => (
        <FolderRow key={node.folder.id} node={node} depth={depth} {...props} />
      ))}
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          depth={depth}
          onEdit={props.onEdit}
          onComplete={props.onComplete}
          isCut={props.cutId === task.id}
          canShift
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
  const isEmpty = !node.folders.length && !node.tasks.length
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
            {node.taskCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {node.taskCount}
              </Badge>
            )}
          </CollapsibleTrigger>
          <RowMenu label={`Actions for ${folder.name}`}>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  props.onToggle(folder.id, true)
                  props.onEdit({
                    kind: 'task',
                    mode: 'edit',
                    folderId: folder.id,
                  })
                }}
              >
                <PlusIcon />
                New task here
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
                tasks={node.tasks}
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

function TaskRow({
  task,
  depth,
  path,
  isCut,
  canShift = false,
  onEdit,
  onComplete,
}: TaskActions & {
  task: Task
  depth: number
  /** Folder path, shown in the flat list. */
  path?: string
  isCut: boolean
  /** Offer move up/down (only where the tree's order is shown). */
  canShift?: boolean
}) {
  const item = { kind: 'task', id: task.id } as const
  const { rowProps, dropZone, isDragging } = useTreeRowDnd(
    item,
    { kind: 'task', task },
    task.title,
  )
  const indent = depth * INDENT_PX

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
      <TaskCheck task={task} onComplete={onComplete} />
      <Button
        data-tree-item
        data-kind="task"
        data-id={task.id}
        data-parent-id={task.folderId ?? ''}
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        title={task.description || undefined}
        onClick={() => onEdit({ kind: 'task', mode: 'view', taskId: task.id })}
      >
        <TaskTitle task={task} />
        {path && <span className="truncate text-muted-foreground">{path}</span>}
        <TaskAge task={task} className="ml-auto" />
      </Button>
      <TaskMenu
        task={task}
        onEdit={onEdit}
        onComplete={onComplete}
        canShift={canShift}
      />
    </li>
  )
}

/** The task's tick box, coloured by its age (green once done). */
export function TaskCheck({
  task,
  onComplete,
}: {
  task: Task
  onComplete: (taskId: number) => void
}) {
  const done = task.completedAt !== null
  const tone = useTone(task)
  return (
    // Same footprint as a folder row's chevron, so rows line up.
    <span className="flex w-8 shrink-0 justify-center">
      <Checkbox
        checked={done}
        onCheckedChange={() => onComplete(task.id)}
        aria-label={
          done ? `Reopen “${task.title}”` : `Complete “${task.title}”`
        }
        className={CHECK_TONE[tone]}
      />
    </span>
  )
}

export function TaskTitle({ task }: { task: Task }) {
  return (
    <span
      className={cn(
        'truncate',
        task.completedAt && 'text-muted-foreground line-through',
      )}
    >
      {task.title}
    </span>
  )
}

/** The task's colour. Ages depend on the browser's timezone, so until
 * hydration an open task is shown uncoloured (the server can't know it). */
function useTone(task: Task): TaskTone {
  const hydrated = useHydrated()
  if (task.completedAt) return 'done'
  return hydrated ? taskTone(task) : 'fresh'
}

/** When an open task is due ("tomorrow 09:00"), else how long it has been
 * open ("today", "3 days"), in its colour. */
export function TaskAge({
  task,
  className,
}: {
  task: Task
  className?: string
}) {
  const hydrated = useHydrated()
  const tone = useTone(task)
  return (
    <span
      className={cn('shrink-0 text-xs tabular-nums', AGE_TONE[tone], className)}
    >
      {!hydrated
        ? null
        : task.dueAt && !task.completedAt
          ? dueLabel(task.dueAt)
          : ageLabel(task)}
    </span>
  )
}

/** A task's hover `…` menu (tree rows, the list and "Up next"). */
export function TaskMenu({
  task,
  onEdit,
  onComplete,
  canShift = false,
}: TaskActions & { task: Task; canShift?: boolean }) {
  const shift = useShiftItem({ kind: 'task', id: task.id }, task.folderId)
  const done = task.completedAt !== null

  return (
    <RowMenu label={`Actions for ${task.title}`}>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() =>
            onEdit({ kind: 'task', mode: 'view', taskId: task.id })
          }
        >
          <EyeIcon />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onComplete(task.id)}>
          {done ? <RotateCcwIcon /> : <CircleCheckIcon />}
          {done ? 'Reopen' : 'Complete'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onEdit({
              kind: 'task',
              mode: 'edit',
              task,
              folderId: task.folderId,
            })
          }
        >
          <PencilIcon />
          Edit or move
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {canShift && <ShiftItems shift={shift} />}
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onEdit({ kind: 'delete-task', task })}
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
