import { randomUUID } from 'node:crypto'

import { listProfiles, profileHandle, withDatabase } from '@/db'
import type { Profile } from '@/db'
import type { AssistantResult } from '@/lib/assistant'
import { referencesByName } from '@/lib/references'
import { ALL_TOOLS, runTool } from './agent-tools.server'
import { addUsage, callModel, llmConfig } from './llm.server'
import type { ModelUsage, ToolDef, Turn } from './llm.server'
import { WEB_SEARCH_PROMPT } from './prompts.server'

// Server-only: the assistant's tool loop, shared by Tell me and Chat. The
// model looks things up, creates, edits or deletes through the tools
// (agent-tools.server.ts) until it answers. Every change is recorded under
// the run's id so the whole run can be undone. With more than one profile
// (Settings → Database) it can also step into another one (`use_database`)
// to look there, or to copy / move things between them.

/** At most this many model calls per request (look-ups, changes, answer).
 * Bulk edits ("translate all my open tasks") need a few rounds. */
const MAX_STEPS = 12
/** Caps what one tool result sends back to the model. */
const MAX_RESULT_CHARS = 40_000

/** Only offered when there's more than one profile. */
const USE_DATABASE_TOOL: ToolDef = {
  name: 'use_database',
  description:
    'Switch to another profile (database) for the following tool calls of this request: look-ups, creates, edits and deletes then happen there, until you switch again.',
  parameters: {
    type: 'object',
    properties: {
      database: { type: 'string', description: 'The profile name.' },
    },
    required: ['database'],
    additionalProperties: false,
  },
}

function profilesPrompt(profiles: Array<Profile>) {
  const active = profiles.find((p) => p.active)!.name
  const names = profiles.map((p) => `"${p.name}"`).join(', ')
  return `The user keeps their data in several profiles (separate databases): ${names}. You start in "${active}", the one they're using. If something isn't found there, look in the others (use_database, then search) before saying it's missing, and say which profile it's in. To copy something to another profile, read it, use_database the target and create it there (same fields, a fitting folder there); to move it, also delete the original in its profile. Switch back to "${active}" when done. Ids and refs belong to the profile they came from; only open_item things in "${active}".`
}

/** The text in a tool's arguments with references' ids dropped. */
function byName(value: unknown): unknown {
  if (typeof value === 'string') return referencesByName(value)
  if (Array.isArray(value)) return value.map(byName)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, byName(v)]),
    )
  }
  return value
}

export type AgentRun = {
  answer: string
  result: AssistantResult
  usage: ModelUsage | null
  /** Set when the run failed part-way (what it did before is in `result`). */
  error: string | null
}

export async function runAgent({
  system: baseSystem,
  turns,
  timeZone,
  webSearch = false,
}: {
  system: string
  turns: Array<Turn>
  timeZone: string
  /** Offer the provider's web search for this request. */
  webSearch?: boolean
}): Promise<AgentRun> {
  const config = await llmConfig()
  if (!config) {
    throw new Error('The assistant is off: add an API key in Settings')
  }

  let system = webSearch ? `${baseSystem}\n${WEB_SEARCH_PROMPT}` : baseSystem
  const runId = randomUUID()
  const result: AssistantResult = { created: [], found: [], changed: [] }
  const ctx = { runId, timeZone, result }
  const profiles = await listProfiles()
  const several = profiles.length > 1
  const tools = several ? [...ALL_TOOLS, USE_DATABASE_TOOL] : ALL_TOOLS
  if (several)
    system = `${system}
${profilesPrompt(profiles)}`
  /** The profile the tools work in (starts on the one in use); `crossed`
   * once the run has been in another one, so text it writes refers to items
   * by name (ids differ between profiles). */
  let profile = profiles.find((p) => p.active)!
  let crossed = false

  const runInProfile = async (name: string, args: unknown) => {
    if (name === 'use_database') {
      const wanted = String(
        (args as { database?: unknown } | null)?.database ?? '',
      )
        .trim()
        .toLowerCase()
      const next = profiles.find((p) => p.name.toLowerCase() === wanted)
      if (!next) {
        return {
          error: `No profile "${wanted}". Profiles: ${profiles.map((p) => p.name).join(', ')}`,
        }
      }
      await profileHandle(next.id) // Fails here if it can't be reached.
      profile = next
      if (!next.active) crossed = true
      return { database: next.name, inUse: next.active }
    }
    const writes = /^(create|update)_/.test(name)
    const input = crossed && writes ? byName(args) : args
    if (profile.active) return runTool(name, input, ctx)
    // In another profile: run it there, and mark what it did as being there.
    const handle = await profileHandle(profile.id)
    const before = [
      result.created.length,
      result.found.length,
      result.changed.length,
    ] as const
    const output = await withDatabase(handle, () => runTool(name, input, ctx))
    const database = profile.name
    for (const entry of result.created.slice(before[0]))
      entry.database = database
    for (const entry of result.found.slice(before[1])) entry.database = database
    for (const entry of result.changed.slice(before[2])) {
      entry.database = database
    }
    return output && typeof output === 'object' && !Array.isArray(output)
      ? { database, ...output }
      : { database, result: output }
  }
  const conversation = [...turns]
  let usage: ModelUsage | null = null
  let answer = ''
  let error: string | null = null

  try {
    for (let step = 0; ; step++) {
      const { calls, text, raw, ...cost } = await callModel(config, {
        system,
        turns: conversation,
        tools,
        webSearch,
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
          output = await runInProfile(call.name, call.args)
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
