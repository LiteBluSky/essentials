import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { assistantInput } from '@/lib/assistant'
import { FILES_ONLY_TEXT, attachmentMeta } from '@/lib/attachments'
import type { AssistantResult } from '@/lib/assistant'
import { z } from 'zod'

import { runAgent } from './agent.server'
import { cancelRequest, isCancelled, trackRequest } from './cancel.server'
import type { AgentRun } from './agent.server'
import { tellPrompt } from './assistant.server'
import { describe } from './assistant-actions.server'
import { clearHistory, loadHistory, logRequest } from './assistant-log.server'
import { undoRunEverywhere } from './changes.server'
import { logText, saveTurn } from './chat.server'
import { assistantConfigured, currentModel } from './llm.server'

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

/** Carries out the sentence with the assistant's tools (create, open,
 * edit, delete; look-ups first) and returns what was done, with the run id
 * for Undo when it changed anything. Every request is logged (assistant
 * history) with what it cost, whether it worked or not. */
export const askAssistant = createServerFn({ method: 'POST' })
  .validator(assistantInput)
  .handler(async ({ data }): Promise<AssistantResult> => {
    const started = Date.now()
    let run: AgentRun | null = null
    let failure: string | null = null
    const tracked = trackRequest(data.requestId)
    const files = attachmentMeta(data.attachments)
    try {
      run = await runAgent({
        system: tellPrompt(data.now, data.timeZone),
        turns: [
          {
            role: 'user',
            text: data.text || FILES_ONLY_TEXT,
            attachments: data.attachments,
          },
        ],
        timeZone: data.timeZone,
        webSearch: data.webSearch,
        signal: tracked.signal,
      })
      const { result } = run
      const didSomething =
        result.created.length + result.found.length + result.changed.length > 0
      if (run.error && !didSomething) failure = run.error
      else if (!didSomething && !run.answer) {
        failure = "Couldn't make anything of that"
      }
    } catch (error) {
      // Cancelled by the user: nothing done, nothing saved or logged.
      if (isCancelled(error)) throw error
      failure = error instanceof Error ? error.message : String(error)
    } finally {
      tracked.done()
    }

    // Every request that reached the model is also a Chat conversation, so
    // it can be seen again (and carried on). Never breaks the request.
    let conversationId: number | null = null
    if (run) {
      try {
        const { message } = await saveTurn(
          null,
          data.text,
          { ...run, error: failure ?? run.error },
          files,
        )
        conversationId = message.conversationId
      } catch (error) {
        console.error("Couldn't save the request to Chat:", error)
      }
    }

    const usage = run?.usage ?? null
    const model = usage ?? (await currentModel())
    const result = run?.result
    await logRequest({
      text: logText(data.text, files),
      source: 'tell',
      provider: model?.provider ?? '',
      model: model?.model ?? '',
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      costUsd: usage?.costUsd ?? null,
      ok: failure === null,
      result:
        (failure ??
          [
            result ? describe(result) : '',
            ...(result?.changed ?? []).map(
              (c) =>
                `${c.op === 'delete' ? 'Deleted' : c.op === 'create' ? 'Created' : 'Changed'}: ${c.label}`,
            ),
            run?.error ? `Stopped: ${run.error}` : '',
          ]
            .filter(Boolean)
            .join('\n')) ||
        (run?.answer ?? '').slice(0, 300),
      durationMs: Date.now() - started,
      runId: result?.runId ?? null,
    })
    if (failure !== null || !result) throw new Error(failure ?? 'Failed')
    return { ...result, conversationId }
  })

/** "Stop": calls off a request that's under way (Ask Jarvis, Chat, the
 * panel, Advice) by the id the browser sent with it. The model call is
 * dropped and what the request had already changed is undone. */
export const cancelAssistant = createServerFn({ method: 'POST' })
  .validator(z.object({ requestId: z.uuid() }))
  .handler(({ data }) => {
    cancelRequest(data.requestId)
  })

/** Undoes everything a run (a Tell me request or chat turn) changed. */
export const undoAssistantRun = createServerFn({ method: 'POST' })
  .validator(z.object({ runId: z.string().uuid() }))
  .handler(({ data }) => undoRunEverywhere(data.runId))

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
