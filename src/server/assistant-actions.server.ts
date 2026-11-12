import { UNSORTED_FOLDER } from '@/lib/assistant'
import type {
  AssistantFound,
  AssistantItem,
  AssistantResult,
} from '@/lib/assistant'
import type { SearchApp } from '@/lib/global-search'
import { DEFAULT_DUE_HOUR } from '@/lib/tasks/tree'
import type { PlannedAction } from './assistant.server'
import { zonedTime } from './llm.server'
import { ensureTopFolder as ensureNoteFolder, insertNote } from './notes.server'
import { search } from './search.server'
import { ensureTopFolder as ensureTaskFolder, insertTask } from './tasks.server'

// Server-only: carrying out what the LLM asked for (Tell me and Chat alike).
// New tasks / notes go to the top-level "Unsorted" folder of their app.

const ALL_APPS: Array<SearchApp> = ['tasks', 'notes', 'bookmarks']

/** The best match for `query` (via the global search): in `app` if given,
 * an item unless a folder was asked for, whose name has every word first
 * (then the search's own order: most recently edited). */
export async function findOne(
  query: string,
  app: SearchApp | undefined,
  folder: boolean,
): Promise<AssistantFound> {
  const results = await search(query)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const wanted = folder ? 'folder' : 'item'
  const score = (r: { kind: string; label: string }) =>
    (words.every((w) => r.label.toLowerCase().includes(w)) ? 0 : 2) +
    (r.kind === wanted ? 0 : 1)
  const pool = (app ? [app] : ALL_APPS)
    .flatMap((a) => results[a].map((r) => ({ ...r, app: a })))
    .sort((a, b) => score(a) - score(b))
  if (pool.length || words.length < 2) {
    return { query, match: pool.at(0) ?? null }
  }
  return { query, match: await partialMatch(words, app, wanted) }
}

/** When no item has every word ("crm toool"): the one whose name has the
 * most of them, searching word by word. */
async function partialMatch(
  words: Array<string>,
  app: SearchApp | undefined,
  wanted: 'folder' | 'item',
) {
  const seen = new Map<string, NonNullable<AssistantFound['match']>>()
  for (const word of words.filter((w) => w.length > 2)) {
    const results = await search(word)
    for (const a of app ? [app] : ALL_APPS) {
      for (const r of results[a])
        seen.set(`${a}-${r.kind}-${r.id}`, { ...r, app: a })
    }
  }
  const hits = (label: string) =>
    words.filter((w) => label.toLowerCase().includes(w)).length
  const best = [...seen.values()]
    .filter((r) => hits(r.label) > 0)
    .sort(
      (a, b) =>
        hits(b.label) - hits(a.label) ||
        Number(b.kind === wanted) - Number(a.kind === wanted) ||
        // A short title holding the word is a closer match than a long one.
        a.label.length - b.label.length,
    )
  return best.at(0) ?? null
}

/** Carries out one action into `result` (created / found). */
export async function runAction(
  action: PlannedAction,
  timeZone: string,
  result: AssistantResult,
) {
  if (action.kind === 'open') {
    const found = await findOne(action.query, action.app, action.folder)
    result.found.push(found)
    return found
  }
  if (action.kind === 'task') {
    const dueAt = action.due
      ? zonedTime(action.due, timeZone, DEFAULT_DUE_HOUR)
      : null
    const folderId = await ensureTaskFolder(UNSORTED_FOLDER)
    const { id } = await insertTask({
      title: action.title,
      description: action.description,
      folderId,
      dueAt,
      remindMinutes: action.remindMinutes,
    })
    const item: AssistantItem = { app: 'tasks', id, title: action.title, dueAt }
    result.created.push(item)
    return item
  }
  const folderId = await ensureNoteFolder(UNSORTED_FOLDER)
  const { id } = await insertNote({
    title: action.title,
    body: action.body,
    folderId,
  })
  const item: AssistantItem = {
    app: 'notes',
    id,
    title: action.title || action.body,
  }
  result.created.push(item)
  return item
}

/** Carries out every action, in order. */
export async function runActions(
  actions: Array<PlannedAction>,
  timeZone: string,
): Promise<AssistantResult> {
  const result: AssistantResult = { created: [], found: [] }
  for (const action of actions) await runAction(action, timeZone, result)
  return result
}

/** One line per thing done, for the history. */
export function describe({ created, found }: AssistantResult) {
  return [
    ...created.map((item) =>
      item.app === 'tasks'
        ? `Task: ${item.title}${item.dueAt ? ` (due ${item.dueAt.toISOString()})` : ''}`
        : `Note: ${item.title.split('\n')[0]}`,
    ),
    ...found.map(({ query, match }) =>
      match ? `Opened: ${match.label} (${match.app})` : `Not found: ${query}`,
    ),
  ].join('\n')
}
