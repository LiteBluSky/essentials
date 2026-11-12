import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  byId,
  contactInput,
  contactsFile,
  folderInput,
  moveInput,
  updateContactInput,
  updateFolderInput,
} from '@/lib/contacts/schemas'
import {
  editContact,
  editFolder,
  importFile,
  insertContact,
  insertFolder,
  loadTree,
  moveItem,
  removeContact,
  removeFolder,
} from './contacts.server'

// No auth by design: the app only listens on localhost (see CLAUDE.md).

export const getTree = createServerFn({ method: 'GET' }).handler(() =>
  loadTree(),
)

export const contactsTreeQueryOptions = queryOptions({
  queryKey: ['contacts', 'tree'],
  queryFn: () => getTree(),
})

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

export const createContact = createServerFn({ method: 'POST' })
  .validator(contactInput)
  .handler(({ data }) => insertContact(data))

export const updateContact = createServerFn({ method: 'POST' })
  .validator(updateContactInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editContact(id, input)
  })

export const deleteContact = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeContact(data.id)
  })

export const moveContact = createServerFn({ method: 'POST' })
  .validator(moveInput)
  .handler(async ({ data }) => {
    await moveItem(data)
  })

export const importContacts = createServerFn({ method: 'POST' })
  .validator(contactsFile)
  .handler(({ data }) => importFile(data))
