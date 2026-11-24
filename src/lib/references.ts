import type { Root, RootContent, Text } from 'mdast'

import type { JarvisApp } from '@/lib/global-search'

// References: `@contact(Jesus#12)` in any text points at an item of another
// (or the same) app. Typed with the `@` autocomplete, which also stores the
// id; a hand-typed `@contact(Jesus)` without one is looked up by name when
// clicked. Rendered as a clickable chip wherever the text is shown.
// Jarvis, working across profiles, adds the profile an item lives in when
// it isn't the one the text is in: `@note(Plan#12@local)` (Local) or
// `@note(Plan#12@3)` (remote database 3); a click switches to it first.

export const REFERENCE_TYPES = [
  { type: 'bookmark', app: 'bookmarks', label: 'Bookmark' },
  { type: 'note', app: 'notes', label: 'Note' },
  { type: 'task', app: 'tasks', label: 'Task' },
  { type: 'contact', app: 'contacts', label: 'Contact' },
] as const satisfies ReadonlyArray<{
  type: string
  app: JarvisApp
  label: string
}>

export type ReferenceType = (typeof REFERENCE_TYPES)[number]['type']

export type Reference = {
  type: ReferenceType
  app: JarvisApp
  name: string
  id: number | null
  /** The profile it lives in when not the one the text belongs to: null =
   * Local, else a remote database's id. Unset = the text's own. */
  profile?: number | null
}

const TYPES = REFERENCE_TYPES.map((t) => t.type).join('|')

/** `@type(name)`, `@type(name#id)` or `@type(name#id@profile)`; the name
 * has no brackets or newlines. */
const REFERENCE = new RegExp(
  `@(${TYPES})\\(([^()\\n]*?)(?:#(\\d+)(?:@(local|\\d+))?)?\\)`,
  'g',
)

/** A profile as written after an id: `local` or the database's id. */
function profileKey(profile: number | null) {
  return profile === null ? 'local' : String(profile)
}

function readProfileKey(key: string): number | null {
  return key === 'local' ? null : Number(key)
}

function toReference(match: RegExpExecArray): Reference {
  const type = match[1] as ReferenceType
  const app = REFERENCE_TYPES.find((t) => t.type === type)!.app
  return {
    type,
    app,
    name: match[2].trim(),
    id: match[3] ? Number(match[3]) : null,
    ...(match[3] && match[4] && { profile: readProfileKey(match[4]) }),
  }
}

/** The text split into plain strings and references, in order. */
export function splitReferences(text: string): Array<string | Reference> {
  const out: Array<string | Reference> = []
  let last = 0
  for (const match of text.matchAll(REFERENCE)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(toReference(match))
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** The text with each reference as just `@name` (labels, snippets, PDF). */
export function plainReferences(text: string) {
  return text.replace(
    REFERENCE,
    (_all, _type, name: string) => `@${name.trim()}`,
  )
}

/**
 * Text written for profile `from` made right for profile `to`: each
 * reference with an id keeps pointing at the same item, so one to an item
 * of another profile than `to` names it (`#12@local`), and one to `to`'s
 * own items names none. (Jarvis across profiles: what a tool in another
 * profile returns, and what it writes there.)
 */
export function rebaseReferences(
  text: string,
  from: number | null,
  to: number | null,
) {
  return text.replace(
    REFERENCE,
    (all, type: string, name: string, id?: string, key?: string) => {
      if (!id) return all
      const home = key === undefined ? from : readProfileKey(key)
      return formatReference(
        type as ReferenceType,
        name,
        Number(id),
        home === to ? undefined : home,
      )
    },
  )
}

/** What the autocomplete inserts for an item (`profile`: the one it lives
 * in, when not the text's own). */
export function formatReference(
  type: ReferenceType,
  name: string,
  id: number,
  profile?: number | null,
) {
  const clean = name.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  const where = profile === undefined ? '' : `@${profileKey(profile)}`
  return `@${type}(${clean || 'Untitled'}#${id}${where})`
}

/** The `@` being typed right before the caret, if any: still choosing the
 * type (`@con`), or searching that type's items (`@contact(jes`). `start` is
 * where the `@` is. */
export type ReferenceQuery =
  | { stage: 'type'; start: number; query: string }
  | { stage: 'item'; start: number; type: ReferenceType; query: string }

export function referenceQuery(textBeforeCaret: string): ReferenceQuery | null {
  const item = new RegExp(`(?:^|[^\\w@])@(${TYPES})\\(([^()\\n]*)$`, 'i').exec(
    textBeforeCaret,
  )
  if (item) {
    return {
      stage: 'item',
      start: textBeforeCaret.length - item[0].length + item[0].indexOf('@'),
      type: item[1].toLowerCase() as ReferenceType,
      query: item[2],
    }
  }
  const type = /(?:^|[^\w@])@([a-z]*)$/i.exec(textBeforeCaret)
  if (type) {
    const query = type[1].toLowerCase()
    if (!REFERENCE_TYPES.some((t) => t.type.startsWith(query))) return null
    return {
      stage: 'type',
      start: textBeforeCaret.length - type[0].length + type[0].indexOf('@'),
      query,
    }
  }
  return null
}

/** Remark plugin: each reference in the text becomes a `<span data-ref>`
 * (rendered as a chip by the markdown components), also one alone in a
 * code span. Not inside code blocks or links. */
export function remarkReferences() {
  const walk = (node: Root | RootContent) => {
    if (!('children' in node) || node.type === 'link') return
    const children: Array<RootContent> = []
    for (const child of node.children as Array<RootContent>) {
      // A reference in backticks (models do that) is still a reference.
      if (child.type === 'inlineCode') {
        const parts = splitReferences(child.value.trim())
        const [part] = parts
        if (parts.length === 1 && typeof part !== 'string') {
          children.push(referenceNode(part))
          continue
        }
      }
      if (child.type !== 'text') {
        walk(child)
        children.push(child)
        continue
      }
      for (const part of splitReferences(child.value)) {
        if (typeof part === 'string') {
          children.push({ type: 'text', value: part } satisfies Text)
        } else {
          children.push(referenceNode(part))
        }
      }
    }
    ;(node as { children: Array<RootContent> }).children = children
  }
  return (tree: Root) => walk(tree)
}

function referenceNode(reference: Reference): Text {
  return {
    type: 'text',
    value: `@${reference.name}`,
    data: {
      hName: 'span',
      hProperties: { dataRef: JSON.stringify(reference) },
      hChildren: [{ type: 'text', value: `@${reference.name}` }],
    },
  }
}

/** The reference a `data-ref` attribute holds (see `remarkReferences`). */
export function readReference(value: unknown): Reference | null {
  if (typeof value !== 'string') return null
  try {
    const ref = JSON.parse(value) as Reference
    return REFERENCE_TYPES.some((t) => t.type === ref.type) ? ref : null
  } catch {
    return null
  }
}
