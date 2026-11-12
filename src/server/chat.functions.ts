import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { chatInput } from '@/lib/chat'
import {
  listConversations,
  loadMessages,
  removeConversation,
  sendMessage,
} from './chat.server'

// The Chat app's RPCs. No auth by design (see CLAUDE.md).

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

export const sendChatMessage = createServerFn({ method: 'POST' })
  .validator(chatInput)
  .handler(({ data }) => sendMessage(data))

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeConversation(data.id)
  })
