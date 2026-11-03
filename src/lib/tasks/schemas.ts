import { z } from 'zod'

// Shared between TanStack Form validators and server-function validators.

const id = z.number().int().positive()

/** A local calendar date, `YYYY-MM-DD` — the name of a dated folder. */
const dateName = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date')

export const folderInput = z.object({
  // Optional — an unnamed folder is named after today's date.
  name: z.string().trim().max(255, 'Keep it under 255 characters'),
  parentId: id.nullable(),
})
export type FolderInput = z.infer<typeof folderInput>

/** Folder picker value meaning "today's dated folder" (created if missing). */
export const TODAY = 'today'

export const taskInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'What needs doing?')
    .max(500, 'Keep it under 500 characters'),
  description: z.string().max(10_000, 'Keep the description shorter'),
  folderId: z.union([id, z.literal(TODAY)]).nullable(),
})
export type TaskInput = z.infer<typeof taskInput>

// What the server gets: the form plus the client's local date, which names
// the "Today" folder (the server may run in another timezone).
export const saveTaskInput = taskInput.extend({ today: dateName })
export type SaveTaskInput = z.infer<typeof saveTaskInput>

export const byId = z.object({ id })

export const updateFolderInput = folderInput.extend({ id })
export const updateTaskInput = saveTaskInput.extend({ id })

export const completeInput = z.object({ id, done: z.boolean() })
export type CompleteInput = z.infer<typeof completeInput>

// Place a folder/task under `parentId` (null = top level) at `index` among
// its new siblings (counted without the moved item itself).
export const moveInput = z.object({
  kind: z.enum(['folder', 'task']),
  id,
  parentId: id.nullable(),
  index: z.number().int().min(0),
})
export type MoveInput = z.infer<typeof moveInput>

// Import/export file: the whole tree, nested, without database ids. Dates
// are kept so ages (and colours) survive a round trip.
export const EXPORT_FORMAT = 1

const exportTask = z.object({
  title: taskInput.shape.title,
  description: taskInput.shape.description.optional(),
  createdAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
})
export type ExportTask = z.infer<typeof exportTask>

export type ExportFolder = {
  name: string
  folders: Array<ExportFolder>
  tasks: Array<ExportTask>
}
const exportFolder: z.ZodType<ExportFolder> = z.lazy(() =>
  z.object({
    name: folderInput.shape.name.min(1, 'Name is required'),
    folders: z.array(exportFolder).default([]),
    tasks: z.array(exportTask).default([]),
  }),
)

export const tasksFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  folders: z.array(exportFolder).default([]),
  tasks: z.array(exportTask).default([]),
})
export type TasksFile = z.infer<typeof tasksFile>
