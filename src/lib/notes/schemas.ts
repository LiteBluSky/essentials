import { z } from 'zod'

// Shared between TanStack Form validators and server-function validators.

const id = z.number().int().positive()

export const folderInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Keep it under 255 characters'),
  parentId: id.nullable(),
})
export type FolderInput = z.infer<typeof folderInput>

export const noteInput = z.object({
  // Optional — an untitled note is listed by a snippet of its body.
  title: z.string().trim().max(255, 'Keep the title under 255 characters'),
  body: z.string().max(500_000, 'This note is too long'),
  folderId: id.nullable(),
})
export type NoteInput = z.infer<typeof noteInput>

export const byId = z.object({ id })

export const updateFolderInput = folderInput.extend({ id })
export const updateNoteInput = noteInput.extend({ id })
export type UpdateNoteInput = z.infer<typeof updateNoteInput>

// Place a folder/note under `parentId` (null = top level) at `index` among
// its new siblings (counted without the moved item itself).
export const moveInput = z.object({
  kind: z.enum(['folder', 'note']),
  id,
  parentId: id.nullable(),
  index: z.number().int().min(0),
})
export type MoveInput = z.infer<typeof moveInput>

// Import/export file: the whole tree, nested, without database ids.
export const EXPORT_FORMAT = 1

const exportNote = z.object({
  title: noteInput.shape.title.optional(),
  body: noteInput.shape.body.default(''),
})
export type ExportNote = z.infer<typeof exportNote>

export type ExportFolder = {
  name: string
  folders: Array<ExportFolder>
  notes: Array<ExportNote>
}
const exportFolder: z.ZodType<ExportFolder> = z.lazy(() =>
  z.object({
    name: folderInput.shape.name,
    folders: z.array(exportFolder).default([]),
    notes: z.array(exportNote).default([]),
  }),
)

export const notesFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  folders: z.array(exportFolder).default([]),
  notes: z.array(exportNote).default([]),
})
export type NotesFile = z.infer<typeof notesFile>
