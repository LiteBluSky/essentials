// One-off: builds the combined Essentials database from the old separate
// Bookmarks and Notes databases. The originals are only read, never changed.
//
//   node scripts/merge-dbs.mjs [bookmarks.db] [notes.db] [essentials.db]
//
// Defaults: data/bookmarks.db, ../notes/data/notes.db, data/essentials.db.
// Refuses to overwrite an existing output file. Safe to run while the old
// servers are up (it takes a consistent snapshot with VACUUM INTO).

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

const DEFAULTS = [
  'data/bookmarks.db',
  '../notes/data/notes.db',
  'data/essentials.db',
]
const [bookmarks, notes, out] = DEFAULTS.map((fallback, i) =>
  resolve(process.argv[i + 2] || fallback),
)

for (const p of [bookmarks, notes]) {
  if (!existsSync(p)) throw new Error(`Not found: ${p}`)
}
if (existsSync(out)) throw new Error(`Already exists, not overwriting: ${out}`)

const quote = (p) => `'${p.replaceAll("'", "''")}'`

// 1. Snapshot the bookmarks DB (tables + migration history) as the new file.
const source = createClient({ url: pathToFileURL(bookmarks).href })
await source.execute(`VACUUM INTO ${quote(out)}`)
source.close()

// 2. Bring it up to date: adds the note tables.
const client = createClient({ url: pathToFileURL(out).href })
await migrate(drizzle(client), { migrationsFolder: 'drizzle' })

// 3. Copy the notes over, ids and all (the note tables are new, so empty).
await client.execute(`ATTACH DATABASE ${quote(notes)} AS old`)
await client.batch(
  [
    `INSERT INTO note_folders (id, name, parent_id, position, created_at, updated_at)
     SELECT id, name, parent_id, position, created_at, updated_at FROM old.folders`,
    `INSERT INTO notes (id, title, body, folder_id, position, view_count, opened_at, created_at, updated_at)
     SELECT id, title, body, folder_id, position, view_count, opened_at, created_at, updated_at FROM old.notes`,
  ],
  'write',
)
await client.execute('DETACH DATABASE old')

const count = async (table) =>
  (await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0].n
console.log(
  `Wrote ${out}: ${await count('folders')} bookmark folders, ${await count('links')} links, ` +
    `${await count('note_folders')} note folders, ${await count('notes')} notes.`,
)
client.close()
