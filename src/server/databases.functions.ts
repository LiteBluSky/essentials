import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  databaseById,
  databaseInput,
  switchDatabaseInput,
} from '@/lib/databases'
import {
  addDatabase,
  removeDatabase,
  selectDatabase,
  viewDatabases,
} from './databases.server'

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
