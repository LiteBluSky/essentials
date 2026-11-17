import { z } from 'zod'

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

/** A sealed secret (vault.ts): base64 of nonce + ciphertext + tag. */
const sealed = z
  .string()
  .min(1, 'Unlock the vault first')
  .max(40_000, 'Keep the notes shorter')
  .regex(/^[A-Za-z0-9+/]+=*$/, 'Not a sealed secret')

/** What the form edits (the secret still in clear, in the browser). */
export const passwordForm = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Keep it under 255 characters'),
  username: max(255),
  url: max(2000),
  password: z.string().max(1000, 'Keep it under 1000 characters'),
  notes: z.string().max(10_000, 'Keep it under 10,000 characters'),
  folderId: id.nullable(),
})
export type PasswordForm = z.infer<typeof passwordForm>

/** What the server gets: the password and notes sealed into `secret`. */
export const passwordInput = passwordForm
  .omit({ password: true, notes: true })
  .extend({ secret: sealed })
export type PasswordInput = z.infer<typeof passwordInput>

export const vaultInput = z.object({
  salt: z.string().min(1).max(100),
  kdf: z.string().min(1).max(200),
  check: sealed,
})

/** A new master password: the new vault row and every secret sealed again. */
export const rekeyInput = z.object({
  vault: vaultInput,
  entries: z.array(z.object({ id, secret: sealed })),
})

export const byId = z.object({ id })

export const updateFolderInput = folderInput.extend({ id })
export const updatePasswordInput = passwordInput.extend({ id })

// Place a folder/password under `parentId` (null = top level) at `index` among
// its new siblings (counted without the moved item itself).
export const moveInput = z.object({
  kind: z.enum(['folder', 'password']),
  id,
  parentId: id.nullable(),
  index: z.number().int().min(0),
})
export type MoveInput = z.infer<typeof moveInput>

// Import/export file: the whole tree, nested, without database ids.
export const EXPORT_FORMAT = 1

// Unencrypted (it's for moving the passwords elsewhere): the browser seals
// each one again on import.
const exportPassword = passwordForm.pick({ name: true }).extend({
  username: passwordForm.shape.username.optional(),
  url: passwordForm.shape.url.optional(),
  password: passwordForm.shape.password.optional(),
  notes: passwordForm.shape.notes.optional(),
})
export type ExportPassword = z.infer<typeof exportPassword>

export type ExportFolder = {
  name: string
  folders: Array<ExportFolder>
  passwords: Array<ExportPassword>
}
const exportFolder: z.ZodType<ExportFolder> = z.lazy(() =>
  z.object({
    name: folderInput.shape.name,
    folders: z.array(exportFolder).default([]),
    passwords: z.array(exportPassword).default([]),
  }),
)

export const passwordsFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  folders: z.array(exportFolder).default([]),
  passwords: z.array(exportPassword).default([]),
})
export type PasswordsFile = z.infer<typeof passwordsFile>

/** An import as the server gets it: the same tree, each secret sealed. */
const importPassword = passwordInput.pick({
  name: true,
  username: true,
  url: true,
  secret: true,
})
export type ImportPassword = z.infer<typeof importPassword>
export type ImportFolder = {
  name: string
  folders: Array<ImportFolder>
  passwords: Array<ImportPassword>
}
const importFolder: z.ZodType<ImportFolder> = z.lazy(() =>
  z.object({
    name: folderInput.shape.name,
    folders: z.array(importFolder),
    passwords: z.array(importPassword),
  }),
)
export const passwordsImport = z.object({
  folders: z.array(importFolder),
  passwords: z.array(importPassword),
})
export type PasswordsImport = z.infer<typeof passwordsImport>
