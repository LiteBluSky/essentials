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

export const linkInput = z.object({
  // Optional — falls back to the URL's hostname on save.
  title: z.string().trim().max(255, 'Keep it under 255 characters'),
  url: z
    .url({
      protocol: /^https?$/,
      error: 'Enter a full URL, e.g. https://example.com',
    })
    .max(2048, 'URL is too long'),
  description: z.string().trim().max(1000, 'Keep it under 1000 characters'),
  folderId: id.nullable(),
})
export type LinkInput = z.infer<typeof linkInput>

export const byId = z.object({ id })

// Favourites are opened with the number keys, so there are at most 9.
export const MAX_FAVORITES = 9
export const favoriteInput = z.object({ id, favorite: z.boolean() })
export type FavoriteInput = z.infer<typeof favoriteInput>

export const updateFolderInput = folderInput.extend({ id })
export const updateLinkInput = linkInput.extend({ id })

// Place a folder/link under `parentId` (null = top level) at `index` among
// its new siblings (counted without the moved item itself).
export const moveInput = z.object({
  kind: z.enum(['folder', 'link']),
  id,
  parentId: id.nullable(),
  index: z.number().int().min(0),
})
export type MoveInput = z.infer<typeof moveInput>

// Import/export file: the whole tree, nested, without database ids.
export const EXPORT_FORMAT = 1

const exportLink = linkInput.pick({ title: true, url: true }).extend({
  description: linkInput.shape.description.optional(),
  // Favourite rank (1 = key 1). Imported ones go after existing favourites.
  favorite: z.number().int().min(1).max(MAX_FAVORITES).optional(),
})
export type ExportLink = z.infer<typeof exportLink>

export type ExportFolder = {
  name: string
  folders: Array<ExportFolder>
  links: Array<ExportLink>
}
const exportFolder: z.ZodType<ExportFolder> = z.lazy(() =>
  z.object({
    name: folderInput.shape.name,
    folders: z.array(exportFolder).default([]),
    links: z.array(exportLink).default([]),
  }),
)

export const bookmarksFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  folders: z.array(exportFolder).default([]),
  links: z.array(exportLink).default([]),
})
export type BookmarksFile = z.infer<typeof bookmarksFile>
