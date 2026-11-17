import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  byId,
  folderInput,
  moveInput,
  passwordInput,
  passwordsImport,
  rekeyInput,
  updateFolderInput,
  updatePasswordInput,
  vaultInput,
} from '@/lib/passwords/schemas'
import {
  editPassword,
  editFolder,
  importFile,
  insertPassword,
  insertFolder,
  insertVault,
  loadTree,
  loadVault,
  rekeyVault,
  moveItem,
  removePassword,
  removeFolder,
} from './passwords.server'

// No auth by design (see CLAUDE.md): what makes Passwords safe on the LAN is
// that the server only gets sealed secrets (lib/passwords/vault.ts).

export const getTree = createServerFn({ method: 'GET' }).handler(() =>
  loadTree(),
)

export const passwordsTreeQueryOptions = queryOptions({
  queryKey: ['passwords', 'tree'],
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

export const createPassword = createServerFn({ method: 'POST' })
  .validator(passwordInput)
  .handler(({ data }) => insertPassword(data))

export const updatePassword = createServerFn({ method: 'POST' })
  .validator(updatePasswordInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editPassword(id, input)
  })

export const deletePassword = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removePassword(data.id)
  })

export const movePassword = createServerFn({ method: 'POST' })
  .validator(moveInput)
  .handler(async ({ data }) => {
    await moveItem(data)
  })

export const importPasswords = createServerFn({ method: 'POST' })
  .validator(passwordsImport)
  .handler(({ data }) => importFile(data))

export const getVault = createServerFn({ method: 'GET' }).handler(() =>
  loadVault(),
)

export const passwordVaultQueryOptions = queryOptions({
  queryKey: ['passwords', 'vault'],
  queryFn: () => getVault(),
})

export const createVault = createServerFn({ method: 'POST' })
  .validator(vaultInput)
  .handler(async ({ data }) => {
    await insertVault(data)
  })

export const changeMasterPassword = createServerFn({ method: 'POST' })
  .validator(rekeyInput)
  .handler(async ({ data }) => {
    await rekeyVault(data)
  })
