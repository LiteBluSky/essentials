import { z } from 'zod'

// Where the data lives (Settings → Database): the local SQLite file, or a
// remote libSQL database such as Turso (one per entry; several Turso
// databases = several entries). Settings themselves always stay local.

/** A remote database as the browser sees it: the token is never sent back,
 * only its last 4 characters. */
export type DatabaseView = {
  id: number
  name: string
  url: string
  tokenHint: string | null
}

export type DatabasesView = {
  /** The remote database in use; null = the local file. */
  activeId: number | null
  /** The local file's path on the server. */
  localPath: string
  /** The saved database couldn't be reached at startup (local is in use). */
  startupError: { name: string; message: string } | null
  databases: Array<DatabaseView>
}

export const databaseInput = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(100),
  url: z
    .string()
    .trim()
    .min(1, 'Paste the database URL')
    .max(500)
    .regex(
      /^(libsql|https?|wss?):\/\/\S+$/,
      'Starts with libsql://, https:// or wss://',
    ),
  authToken: z.string().trim().max(4000),
})
export type DatabaseInput = z.infer<typeof databaseInput>

/** An edit: an empty token keeps the saved one, unless `clearToken`. */
export const databaseUpdate = databaseInput.extend({
  id: z.number().int().positive(),
  clearToken: z.boolean(),
})
export type DatabaseUpdate = z.infer<typeof databaseUpdate>

/** Which database to use: a remote one's id, or null for the local file. */
export const switchDatabaseInput = z.object({
  id: z.number().int().positive().nullable(),
})

export const databaseById = z.object({ id: z.number().int().positive() })

/** Copy from: a remote database's id, or null for the local file. */
export const copyDatabaseInput = z.object({
  id: z.number().int().positive().nullable(),
})
