import { randomUUID } from 'node:crypto'

import type { AssistantResult } from '@/lib/assistant'
import { ALL_TOOLS, runTool } from './agent-tools.server'
import { addUsage, callModel, llmConfig } from './llm.server'
import type { ModelUsage, Turn } from './llm.server'

// Server-only: the assistant's tool loop, shared by Tell me and Chat. The
// model looks things up, creates, edits or deletes through the tools
// (agent-tools.server.ts) until it answers. Every change is recorded under
// the run's id so the whole run can be undone.

/** At most this many model calls per request (look-ups, changes, answer).
 * Bulk edits ("translate all my open tasks") need a few rounds. */
const MAX_STEPS = 12
/** Caps what one tool result sends back to the model. */
const MAX_RESULT_CHARS = 40_000

export type AgentRun = {
  answer: string
  result: AssistantResult
  usage: ModelUsage | null
  /** Set when the run failed part-way (what it did before is in `result`). */
  error: string | null
}

export async function runAgent({
  system,
  turns,
  timeZone,
}: {
  system: string
  turns: Array<Turn>
  timeZone: string
}): Promise<AgentRun> {
  const config = await llmConfig()
  if (!config) {
    throw new Error('The assistant is off: add an API key in Settings')
  }

  const runId = randomUUID()
  const result: AssistantResult = { created: [], found: [], changed: [] }
  const ctx = { runId, timeZone, result }
  const conversation = [...turns]
  let usage: ModelUsage | null = null
  let answer = ''
  let error: string | null = null

  try {
    for (let step = 0; ; step++) {
      const { calls, text, raw, ...cost } = await callModel(config, {
        system,
        turns: conversation,
        tools: ALL_TOOLS,
      })
      usage = addUsage(usage, cost)
      if (!calls.length) {
        answer = text.trim()
        break
      }
      if (step === MAX_STEPS - 1) {
        answer =
          text.trim() ||
          'I ran out of steps before finishing. Ask me to continue, or be more specific.'
        break
      }
      conversation.push({ role: 'assistant', text, calls, raw })
      const results = []
      for (const call of calls) {
        let output: unknown
        try {
          output = await runTool(call.name, call.args, ctx)
        } catch (toolError) {
          output = {
            error:
              toolError instanceof Error
                ? toolError.message
                : String(toolError),
          }
        }
        const content = JSON.stringify(output)
        results.push({
          id: call.id,
          content:
            content.length > MAX_RESULT_CHARS
              ? `${content.slice(0, MAX_RESULT_CHARS)}… (cut short)`
              : content,
        })
      }
      conversation.push({ role: 'tool', results })
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  const changedAnything = result.created.length + result.changed.length > 0
  result.runId = changedAnything ? runId : null
  result.answer = answer
  return { answer, result, usage, error }
}
