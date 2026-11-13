import { z } from 'zod'

import { parseBirthday } from './birthday'

// Shared between TanStack Form validators and server-function validators.

const id = z.number().int().positive()
const max = (n: number) =>
  z.string().trim().max(n, `Keep it under ${n} characters`)

export const folderInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Keep it under 255 characters'),
  parentId: id.nullable(),
})
export type FolderInput = z.infer<typeof folderInput>

/** `MM-DD` or `YYYY-MM-DD`; '' = none. */
export const birthdayInput = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .refine(
      (value) => parseBirthday(value) !== null,
      'Pick a day and a month (the year is optional)',
    ),
])

export const contactInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Keep it under 255 characters'),
  phone: max(50),
  email: z.union([
    z.literal(''),
    z.email('Enter a valid email address').max(255),
  ]),
  address: max(500),
  knownFrom: max(255),
  birthday: birthdayInput,
  description: max(5000),
  folderId: id.nullable(),
})
export type ContactInput = z.infer<typeof contactInput>

export const byId = z.object({ id })

export const updateFolderInput = folderInput.extend({ id })
export const updateContactInput = contactInput.extend({ id })

// Place a folder/contact under `parentId` (null = top level) at `index` among
// its new siblings (counted without the moved item itself).
export const moveInput = z.object({
  kind: z.enum(['folder', 'contact']),
  id,
  parentId: id.nullable(),
  index: z.number().int().min(0),
})
export type MoveInput = z.infer<typeof moveInput>

// Import/export file: the whole tree, nested, without database ids.
export const EXPORT_FORMAT = 1

const exportContact = contactInput.pick({ name: true }).extend({
  phone: contactInput.shape.phone.optional(),
  email: contactInput.shape.email.optional(),
  address: contactInput.shape.address.optional(),
  knownFrom: contactInput.shape.knownFrom.optional(),
  birthday: contactInput.shape.birthday.optional(),
  description: contactInput.shape.description.optional(),
})
export type ExportContact = z.infer<typeof exportContact>

export type ExportFolder = {
  name: string
  folders: Array<ExportFolder>
  contacts: Array<ExportContact>
}
const exportFolder: z.ZodType<ExportFolder> = z.lazy(() =>
  z.object({
    name: folderInput.shape.name,
    folders: z.array(exportFolder).default([]),
    contacts: z.array(exportContact).default([]),
  }),
)

export const contactsFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  folders: z.array(exportFolder).default([]),
  contacts: z.array(exportContact).default([]),
})
export type ContactsFile = z.infer<typeof contactsFile>
