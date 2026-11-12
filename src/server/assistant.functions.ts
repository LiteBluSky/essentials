import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { assistantInput } from '@/lib/assistant'
import type { AssistantResult } from '@/lib/assistant'
import { planActions } from './assistant.server'
import { describe, runActions } from './assistant-actions.server'
import { clearHistory, loadHistory, logRequest } from './assistant-log.server'
import { assistantConfigured, currentModel } from './llm.server'
import type { ModelUsage } from './llm.server'

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

/** Reads the sentence, creates its tasks / notes in "Unsorted" and finds
 * what it asks to open. Every request is logged (assistant history), with
 * what it cost, whether it worked or not. */
export const askAssistant = createServerFn({ method: 'POST' })
  .validator(assistantInput)
  .handler(async ({ data }): Promise<AssistantResult> => {
    const started = Date.now()
    let usage: ModelUsage | null = null
    try {
      const plan = await planActions(data)
      usage = plan.usage
      if (!plan.actions.length) {
        throw new Error(
          plan.text.trim()
            ? `No task, note or search came of that. The model said: ${plan.text.trim().slice(0, 300)}`
            : "Couldn't make a task or note of that, or find what to open",
        )
      }
      const result = await runActions(plan.actions, data.timeZone)
      await logRequest({
        text: data.text,
        source: 'tell',
        ...usage,
        ok: true,
        result: describe(result),
        durationMs: Date.now() - started,
      })
      return result
    } catch (error) {
      const fallback = usage ?? (await currentModel())
      await logRequest({
        text: data.text,
        source: 'tell',
        provider: fallback?.provider ?? '',
        model: fallback?.model ?? '',
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        costUsd: usage?.costUsd ?? null,
        ok: false,
        result: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      })
      throw error
    }
  })

/** The assistant history: the latest requests and totals over all of them. */
export const getAssistantHistory = createServerFn({ method: 'GET' }).handler(
  () => loadHistory(),
)

export const assistantHistoryQueryOptions = queryOptions({
  queryKey: ['assistant', 'history'],
  queryFn: () => getAssistantHistory(),
})

export const clearAssistantHistory = createServerFn({
  method: 'POST',
}).handler(async () => {
  await clearHistory()
})
