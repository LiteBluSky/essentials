import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'] })

// Same default as src/db/index.ts.
const path = resolve(process.env.DATABASE_PATH || 'data/essentials.db')

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: { url: pathToFileURL(path).href },
})
