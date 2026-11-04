import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  byId,
  completeInput,
  createTaskInput,
  folderInput,
  moveInput,
  tasksFile,
  updateFolderInput,
  updateTaskInput,
} from '@/lib/tasks/schemas'
import {
  editFolder,
  editTask,
  importFile,
  insertFolder,
  insertTask,
  loadTree,
  moveItem,
  removeFolder,
  removeTask,
  setCompleted,
} from './tasks.server'

// No auth by design: the server is only meant for the owner's LAN (see
// CLAUDE.md).

export const getTree = createServerFn({ method: 'GET' }).handler(() =>
  loadTree(),
)

export const tasksTreeQueryOptions = queryOptions({
  queryKey: ['tasks', 'tree'],
  queryFn: () => getTree(),
})

export type TreeData = Awaited<ReturnType<typeof getTree>>

export const createFolder = createServerFn({ method: 'POST' })
  .validator(folderInput)
  .handler(({ data }) => insertFolder(data))

export const updateFolder = createServerFn({ method: 'POST' })
  .validator(updateFolderInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editFolder(id, input)
  })

export const deleteFolder = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeFolder(data.id)
  })

export const createTask = createServerFn({ method: 'POST' })
  .validator(createTaskInput)
  .handler(({ data }) => insertTask(data))

export const updateTask = createServerFn({ method: 'POST' })
  .validator(updateTaskInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editTask(id, input)
  })

export const deleteTask = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeTask(data.id)
  })

export const completeTask = createServerFn({ method: 'POST' })
  .validator(completeInput)
  .handler(async ({ data }) => {
    await setCompleted(data)
  })

export const moveTreeItem = createServerFn({ method: 'POST' })
  .validator(moveInput)
  .handler(async ({ data }) => {
    await moveItem(data)
  })

export const importTasks = createServerFn({ method: 'POST' })
  .validator(tasksFile)
  .handler(({ data }) => importFile(data))
