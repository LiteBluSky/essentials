import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { UNSORTED_FOLDER, assistantInput } from '@/lib/assistant'
import type { AssistantItem } from '@/lib/assistant'
import { DEFAULT_DUE_HOUR } from '@/lib/tasks/tree'
import { assistantConfigured, planActions, zonedTime } from './assistant.server'
import { ensureTopFolder as ensureNoteFolder, insertNote } from './notes.server'
import { ensureTopFolder as ensureTaskFolder, insertTask } from './tasks.server'

// The assistant ("Tell me…"), shared by every app. No auth by design (see
// CLAUDE.md).

/** Whether the field is shown (LLM_API_KEY set); never exposes the key. */
export const getAssistantEnabled = createServerFn({ method: 'GET' }).handler(
  () => assistantConfigured(),
)

/** Prefetched by each app's loader; fixed while the server runs. */
export const assistantEnabledQueryOptions = queryOptions({
  queryKey: ['assistant', 'enabled'],
  queryFn: () => getAssistantEnabled(),
  staleTime: Infinity,
})

/** Reads the sentence and creates its tasks / notes in "Unsorted". */
export const askAssistant = createServerFn({ method: 'POST' })
  .validator(assistantInput)
  .handler(async ({ data }): Promise<Array<AssistantItem>> => {
    const actions = await planActions(data)
    const items: Array<AssistantItem> = []
    for (const action of actions) {
      if (action.kind === 'task') {
        const dueAt = action.due
          ? zonedTime(action.due, data.timeZone, DEFAULT_DUE_HOUR)
          : null
        const folderId = await ensureTaskFolder(UNSORTED_FOLDER)
        const { id } = await insertTask({
          title: action.title,
          description: action.description,
          folderId,
          dueAt,
        })
        items.push({ app: 'tasks', id, title: action.title, dueAt })
      } else {
        const folderId = await ensureNoteFolder(UNSORTED_FOLDER)
        const { id } = await insertNote({
          title: action.title,
          body: action.body,
          folderId,
        })
        items.push({ app: 'notes', id, title: action.title || action.body })
      }
    }
    return items
  })
