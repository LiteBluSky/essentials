import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  copyDatabaseInput,
  databaseById,
  databaseInput,
  databaseUpdate,
  switchDatabaseInput,
} from '@/lib/databases'
import {
  addDatabase,
  removeDatabase,
  selectDatabase,
  updateDatabase,
  viewDatabases,
} from './databases.server'
import { copyFromDatabase } from './database-copy.server'

// Settings → Database. No auth (see CLAUDE.md), like the other settings;
// tokens are never sent back out.

export const getDatabases = createServerFn({ method: 'GET' }).handler(() =>
  viewDatabases(),
)

export const databasesQueryOptions = queryOptions({
  queryKey: ['settings', 'databases'],
  queryFn: () => getDatabases(),
})

export const createDatabase = createServerFn({ method: 'POST' })
  .validator(databaseInput)
  .handler(({ data }) => addDatabase(data))

export const editDatabase = createServerFn({ method: 'POST' })
  .validator(databaseUpdate)
  .handler(({ data }) => updateDatabase(data))

export const switchDatabase = createServerFn({ method: 'POST' })
  .validator(switchDatabaseInput)
  .handler(async ({ data }) => {
    await selectDatabase(data.id)
  })

export const deleteDatabase = createServerFn({ method: 'POST' })
  .validator(databaseById)
  .handler(async ({ data }) => {
    await removeDatabase(data.id)
  })

/** Replaces the data in the database in use with another one's. */
export const copyDatabase = createServerFn({ method: 'POST' })
  .validator(copyDatabaseInput)
  .handler(({ data }) => copyFromDatabase(data.id))
