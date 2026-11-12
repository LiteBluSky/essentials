import { differenceInCalendarDays, format } from 'date-fns'

import type { Folder, Task } from '@/db/schema'
import { EXPORT_FORMAT } from '@/lib/tasks/schemas'
import type { ExportFolder, ExportTask, TasksFile } from '@/lib/tasks/schemas'

export type FolderNode = {
  folder: Folder
  folders: Array<FolderNode>
  tasks: Array<Task>
  /** Total tasks in this folder and all subfolders. */
  taskCount: number
}

export type Tree = {
  folders: Array<FolderNode>
  tasks: Array<Task>
}

function count(node: FolderNode): number {
  node.taskCount =
    node.tasks.length + node.folders.reduce((n, f) => n + count(f), 0)
  return node.taskCount
}

// Rows arrive pre-sorted by position from the server; grouping keeps that order.
export function buildTree(folders: Array<Folder>, tasks: Array<Task>): Tree {
  const nodes = new Map<number, FolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { folder, folders: [], tasks: [], taskCount: 0 })
  }

  const root: Tree = { folders: [], tasks: [] }
  for (const node of nodes.values()) {
    const parentId = node.folder.parentId
    const parent = parentId === null ? undefined : nodes.get(parentId)
    ;(parent ?? root).folders.push(node)
  }
  for (const task of tasks) {
    const parent = task.folderId === null ? undefined : nodes.get(task.folderId)
    ;(parent ?? root).tasks.push(task)
  }
  root.folders.forEach(count)
  return root
}

export type TaskStatus = 'open' | 'done'

/**
 * Only the open (or only the completed) tasks, with counts to match. In the
 * open view a folder whose tasks are all done disappears (old dated folders
 * don't pile up) but a folder that never had any stays; in the done view
 * only folders with completed tasks remain.
 */
export function filterStatus(tree: Tree, status: TaskStatus): Tree {
  const keep = (t: Task) => (t.completedAt !== null) === (status === 'done')
  const filterNode = (node: FolderNode): FolderNode | null => {
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const tasks = node.tasks.filter(keep)
    const next = { ...node, folders, tasks }
    const shown = count(next)
    if (shown || folders.length) return next
    return status === 'open' && node.taskCount === 0 ? next : null
  }
  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    tasks: tree.tasks.filter(keep),
  }
}

function taskMatches(task: Task, query: string) {
  return [task.title, task.description].some((value) =>
    value.toLowerCase().includes(query),
  )
}

/** The day a task belongs to in the calendar: its due date, else the day it
 * was created. */
export function taskDay(task: Pick<Task, 'createdAt' | 'dueAt'>) {
  return task.dueAt ?? task.createdAt
}

/** Only the tasks on `day` (`YYYY-MM-DD`, local; see `todayName` and
 * `taskDay`), plus the folders leading to them. Browser only (timezone). */
export function filterDay(tree: Tree, day: string): Tree {
  const onDay = (t: Task) => todayName(taskDay(t)) === day
  const filterNode = (node: FolderNode): FolderNode | null => {
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const tasks = node.tasks.filter(onDay)
    if (!folders.length && !tasks.length) return null
    const next = { ...node, folders, tasks }
    count(next)
    return next
  }
  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    tasks: tree.tasks.filter(onDay),
  }
}

// Keeps tasks that match, plus the folders leading to them. A folder whose own
// name matches keeps all of its contents.
export function filterTree(tree: Tree, rawQuery: string): Tree {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return tree

  const filterNode = (node: FolderNode): FolderNode | null => {
    if (node.folder.name.toLowerCase().includes(query)) return node
    const folders = node.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null)
    const tasks = node.tasks.filter((t) => taskMatches(t, query))
    if (!folders.length && !tasks.length) return null
    const next = { ...node, folders, tasks }
    count(next)
    return next
  }

  return {
    folders: tree.folders
      .map(filterNode)
      .filter((n): n is FolderNode => n !== null),
    tasks: tree.tasks.filter((t) => taskMatches(t, query)),
  }
}

/** Every task in the tree, without folders: open ones oldest first,
 * completed ones most recently completed first. */
export function flatTasks(tree: Tree, status: TaskStatus): Array<Task> {
  const out = [...tree.tasks]
  const walk = (nodes: Array<FolderNode>) => {
    for (const node of nodes) {
      out.push(...node.tasks)
      walk(node.folders)
    }
  }
  walk(tree.folders)
  return status === 'open'
    ? out.sort(byCreated)
    : out.sort(
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
      )
}

function byCreated(a: Task, b: Task) {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id
}

/** How many tasks "Up next" lists (keys 1-9). */
export const UP_NEXT_COUNT = 9

/** The oldest open tasks, oldest first: they've waited longest. */
export function upNext(tasks: Array<Task>) {
  return tasks
    .filter((t) => t.completedAt === null)
    .sort(byCreated)
    .slice(0, UP_NEXT_COUNT)
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Calendar days since the task was created, in the local timezone: a task
 * from yesterday is 1 day old even if it's been less than 24h. Depends on the
 * timezone, so only compute it in the browser (see `useHydrated`). */
export function taskAgeDays(task: Pick<Task, 'createdAt'>, now = new Date()) {
  const diff = startOfDay(now).getTime() - startOfDay(task.createdAt).getTime()
  // Round: a day across a DST change is 23h or 25h.
  return Math.max(0, Math.round(diff / DAY_MS))
}

/**
 * The task's colour: green once done. With a due date: red once it's past,
 * yellow on the day. Without: red after 3 days open, yellow after 1, none
 * while fresh.
 */
export type TaskTone = 'done' | 'overdue' | 'due' | 'fresh'

export function taskTone(
  task: Pick<Task, 'createdAt' | 'completedAt' | 'dueAt'>,
  now = new Date(),
): TaskTone {
  if (task.completedAt) return 'done'
  if (task.dueAt) {
    if (task.dueAt <= now) return 'overdue'
    return todayName(task.dueAt) === todayName(now) ? 'due' : 'fresh'
  }
  const days = taskAgeDays(task, now)
  return days >= 3 ? 'overdue' : days >= 1 ? 'due' : 'fresh'
}

/** "today", "1 day", "5 days". */
export function ageLabel(task: Pick<Task, 'createdAt'>, now = new Date()) {
  const days = taskAgeDays(task, now)
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`
}

/** When it's due, short: "today 15:00", "tomorrow 09:00", "Fri 15:00",
 * "12 Dec 15:00" (with the year when it isn't this one). Browser only. */
export function dueLabel(dueAt: Date, now = new Date()) {
  const time = format(dueAt, 'HH:mm')
  const days = differenceInCalendarDays(dueAt, now)
  if (days === 0) return `today ${time}`
  if (days === 1) return `tomorrow ${time}`
  if (days === -1) return `yesterday ${time}`
  if (days > 1 && days < 7) return format(dueAt, 'EEE HH:mm')
  return format(
    dueAt,
    dueAt.getFullYear() === now.getFullYear()
      ? 'd MMM HH:mm'
      : 'd MMM yyyy HH:mm',
  )
}

/** The form's "Remind" choices: minutes before the due time (null =
 * no reminder). */
export const REMIND_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 0, label: 'At the due time' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 24 * 60, label: '1 day before' },
  { value: null, label: 'No reminder' },
]

/** "15 min", "2 hours", "1 day": a reminder's lead time. */
export function leadLabel(minutes: number) {
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? '' : 's'}`
  if (minutes % (24 * 60) === 0) return plural(minutes / (24 * 60), 'day')
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour')
  return `${minutes} min`
}

/** "At the due time", "15 min before", "No reminder". */
export function remindLabel(minutes: number | null) {
  if (minutes === null) return 'No reminder'
  return minutes === 0 ? 'At the due time' : `${leadLabel(minutes)} before`
}

/** A due date given as a day only lands at this time (local). */
export const DEFAULT_DUE_HOUR = 9

/** Completed tasks are deleted this many days after they were completed
 * (lazily, whenever the tree loads). Open tasks are never removed. */
export const COMPLETED_TTL_DAYS = 7

/** Anything completed before this is past keeping. */
export function completedCutoff(now = Date.now()) {
  return new Date(now - COMPLETED_TTL_DAYS * DAY_MS)
}

/** How many days ahead "Upcoming" looks (today included). */
export const UPCOMING_DAYS = 7

/** Open tasks that are overdue or due within `UPCOMING_DAYS`, soonest
 * first. Browser only (timezone). */
export function upcomingTasks(tasks: Array<Task>, now = new Date()) {
  return tasks
    .filter(
      (t): t is Task & { dueAt: Date } =>
        t.completedAt === null &&
        t.dueAt !== null &&
        differenceInCalendarDays(t.dueAt, now) < UPCOMING_DAYS,
    )
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id - b.id)
}

/** The tasks on today (see `taskDay`), open or done, in the order they were
 * added — except open ones with a due date, which "Upcoming" lists. Depends
 * on the timezone: browser only. */
export function todayTasks(tasks: Array<Task>, now = new Date()) {
  const today = todayName(now)
  return tasks
    .filter(
      (t) =>
        todayName(taskDay(t)) === today && !(t.dueAt && t.completedAt === null),
    )
    .sort(byCreated)
}

/** The local date as `YYYY-MM-DD`: names the "Today" folder and unnamed
 * folders. */
export function todayName(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type FolderOption = { id: number; name: string; depth: number }

// Depth-first flat list for folder pickers. `excludeId` drops that folder and
// its descendants (a folder can't be moved into itself).
export function flattenFolders(
  tree: Tree,
  excludeId?: number,
): Array<FolderOption> {
  const out: Array<FolderOption> = []
  const walk = (nodes: Array<FolderNode>, depth: number) => {
    for (const node of nodes) {
      if (node.folder.id === excludeId) continue
      out.push({ id: node.folder.id, name: node.folder.name, depth })
      walk(node.folders, depth + 1)
    }
  }
  walk(tree.folders, 0)
  return out
}

/** `ids` without `id`, then `id` inserted at `index` (clamped). */
export function reorderIds(ids: Array<number>, id: number, index: number) {
  const rest = ids.filter((x) => x !== id)
  const at = Math.min(Math.max(index, 0), rest.length)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** Ids of the folders or tasks directly under `parentId`, in display order. */
export function childIds(
  tree: Tree,
  kind: 'folder' | 'task',
  parentId: number | null,
): Array<number> {
  const container = parentId === null ? tree : findFolder(tree, parentId)
  if (!container) return []
  return kind === 'folder'
    ? container.folders.map((n) => n.folder.id)
    : container.tasks.map((t) => t.id)
}

export function findFolder(tree: Tree, id: number): FolderNode | undefined {
  const stack = [...tree.folders]
  while (stack.length) {
    const node = stack.pop()!
    if (node.folder.id === id) return node
    stack.push(...node.folders)
  }
  return undefined
}

/** Folder names from the top level down to `folderId` (empty at root). */
export function folderPath(tree: Tree, folderId: number | null) {
  const path: Array<string> = []
  let current = folderId
  while (current !== null) {
    const node = findFolder(tree, current)
    if (!node) break
    path.unshift(node.folder.name)
    current = node.folder.parentId
  }
  return path
}

/** True if `folderId` is `candidateId` or one of its ancestors. */
export function isSelfOrAncestor(
  tree: Tree,
  folderId: number,
  candidateId: number,
): boolean {
  let current: number | null = candidateId
  while (current !== null) {
    if (current === folderId) return true
    current = findFolder(tree, current)?.folder.parentId ?? null
  }
  return false
}

// The tree as an import/export file (same order, no ids).
export function toTasksFile(tree: Tree): TasksFile {
  const task = (t: Task): ExportTask => ({
    title: t.title,
    ...(t.description && { description: t.description }),
    createdAt: t.createdAt.toISOString(),
    ...(t.completedAt && { completedAt: t.completedAt.toISOString() }),
    ...(t.dueAt && { dueAt: t.dueAt.toISOString() }),
    ...(t.dueAt && t.remindMinutes !== 0 && { remindMinutes: t.remindMinutes }),
  })
  const folder = (node: FolderNode): ExportFolder => ({
    name: node.folder.name,
    folders: node.folders.map(folder),
    tasks: node.tasks.map(task),
  })
  return {
    format: EXPORT_FORMAT,
    folders: tree.folders.map(folder),
    tasks: tree.tasks.map(task),
  }
}
