import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  byId,
  folderInput,
  moveInput,
  noteInput,
  notesFile,
  updateFolderInput,
  updateNoteInput,
} from '@/lib/notes/schemas'
import {
  editFolder,
  editNote,
  importFile,
  insertFolder,
  insertNote,
  loadTree,
  moveItem,
  recordView,
  removeFolder,
  removeNote,
} from './notes.server'

// No auth by design: the server is only meant for the owner's LAN (see
// CLAUDE.md).

export const getTree = createServerFn({ method: 'GET' }).handler(() =>
  loadTree(),
)

export const notesTreeQueryOptions = queryOptions({
  queryKey: ['notes', 'tree'],
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

export const createNote = createServerFn({ method: 'POST' })
  .validator(noteInput)
  .handler(({ data }) => insertNote(data))

export const updateNote = createServerFn({ method: 'POST' })
  .validator(updateNoteInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editNote(id, input)
  })

export const deleteNote = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeNote(data.id)
  })

export const viewNote = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await recordView(data.id)
  })

export const moveTreeItem = createServerFn({ method: 'POST' })
  .validator(moveInput)
  .handler(async ({ data }) => {
    await moveItem(data)
  })

export const importNotes = createServerFn({ method: 'POST' })
  .validator(notesFile)
  .handler(({ data }) => importFile(data))
