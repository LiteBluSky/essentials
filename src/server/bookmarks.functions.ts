import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  bookmarksFile,
  byId,
  favoriteInput,
  folderInput,
  linkInput,
  moveInput,
  updateFolderInput,
  updateLinkInput,
} from '@/lib/bookmarks/schemas'
import {
  editFolder,
  editLink,
  importFile,
  insertFolder,
  insertLink,
  loadTree,
  moveItem,
  removeFolder,
  removeLink,
  setFavorite,
} from './bookmarks.server'

// No auth by design: the app only listens on localhost (see CLAUDE.md).

export const getTree = createServerFn({ method: 'GET' }).handler(() =>
  loadTree(),
)

export const bookmarksTreeQueryOptions = queryOptions({
  queryKey: ['bookmarks', 'tree'],
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

export const createLink = createServerFn({ method: 'POST' })
  .validator(linkInput)
  .handler(({ data }) => insertLink(data))

export const updateLink = createServerFn({ method: 'POST' })
  .validator(updateLinkInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editLink(id, input)
  })

export const deleteLink = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeLink(data.id)
  })

export const favoriteLink = createServerFn({ method: 'POST' })
  .validator(favoriteInput)
  .handler(async ({ data }) => {
    await setFavorite(data)
  })

export const moveBookmark = createServerFn({ method: 'POST' })
  .validator(moveInput)
  .handler(async ({ data }) => {
    await moveItem(data)
  })

export const importBookmarks = createServerFn({ method: 'POST' })
  .validator(bookmarksFile)
  .handler(({ data }) => importFile(data))
