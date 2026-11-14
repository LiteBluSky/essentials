import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  listConversations,
  loadMessages,
  answerToNote,
  removeConversation,
} from './chat.server'

// The Chat app's RPCs. No auth by design (see CLAUDE.md). Sending a
// message streams, so it's a route: `/api/chat` (routes/api/chat.ts).

const byId = z.object({ id: z.number().int().positive() })

export const getConversations = createServerFn({ method: 'GET' }).handler(() =>
  listConversations(),
)

export const chatConversationsQueryOptions = queryOptions({
  queryKey: ['chat', 'conversations'],
  queryFn: () => getConversations(),
})

export const getConversation = createServerFn({ method: 'GET' })
  .validator(byId)
  .handler(({ data }) => loadMessages(data.id))

export const chatMessagesQueryOptions = (id: number) =>
  queryOptions({
    queryKey: ['chat', 'messages', id],
    queryFn: () => getConversation({ data: { id } }),
  })

/** Saves a chat answer as a note ("Save as note" under each answer). */
export const saveAnswerAsNote = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(({ data }) => answerToNote(data.id))

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeConversation(data.id)
  })
