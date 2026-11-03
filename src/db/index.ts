import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

import * as schema from './schema.ts'

// A single SQLite file, created on first start. Relative paths resolve from
// the working directory (the project root for `pnpm dev` and start.ps1).
const path = resolve(process.env.DATABASE_PATH || 'data/essentials.db')
mkdirSync(dirname(path), { recursive: true })

const client = createClient({ url: pathToFileURL(path).href })

export const db = drizzle({ client, schema })

// Bring the schema up to date (creates the tables on a fresh file).
await migrate(db, { migrationsFolder: resolve('drizzle') })
