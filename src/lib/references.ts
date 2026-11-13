import type { Root, RootContent, Text } from 'mdast'

import type { SearchApp } from '@/lib/global-search'

// References: `@contact(Jesus#12)` in any text points at an item of another
// (or the same) app. Typed with the `@` autocomplete, which also stores the
// id; a hand-typed `@contact(Jesus)` without one is looked up by name when
// clicked. Rendered as a clickable chip wherever the text is shown.

export const REFERENCE_TYPES = [
  { type: 'bookmark', app: 'bookmarks', label: 'Bookmark' },
  { type: 'note', app: 'notes', label: 'Note' },
  { type: 'task', app: 'tasks', label: 'Task' },
  { type: 'contact', app: 'contacts', label: 'Contact' },
] as const satisfies ReadonlyArray<{
  type: string
  app: SearchApp
  label: string
}>

export type ReferenceType = (typeof REFERENCE_TYPES)[number]['type']

export type Reference = {
  type: ReferenceType
  app: SearchApp
  name: string
  id: number | null
}

const TYPES = REFERENCE_TYPES.map((t) => t.type).join('|')

/** `@type(name)` or `@type(name#id)`; the name has no brackets or newlines. */
const REFERENCE = new RegExp(`@(${TYPES})\\(([^()\\n]*?)(?:#(\\d+))?\\)`, 'g')

function toReference(match: RegExpExecArray): Reference {
  const type = match[1] as ReferenceType
  const app = REFERENCE_TYPES.find((t) => t.type === type)!.app
  return {
    type,
    app,
    name: match[2].trim(),
    id: match[3] ? Number(match[3]) : null,
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

/** The text with each reference's id dropped (`@note(Name)`), so it's
 * looked up by name: for text taken to another profile, where the ids mean
 * other items. */
export function referencesByName(text: string) {
  return text.replace(
    REFERENCE,
    (_all, type: string, name: string) => `@${type}(${name.trim()})`,
  )
}

/** What the autocomplete inserts for an item. */
export function formatReference(type: ReferenceType, name: string, id: number) {
  const clean = name.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  return `@${type}(${clean || 'Untitled'}#${id})`
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
 * (rendered as a chip by the markdown components). Not inside code or
 * links. */
export function remarkReferences() {
  const walk = (node: Root | RootContent) => {
    if (!('children' in node) || node.type === 'link') return
    const children: Array<RootContent> = []
    for (const child of node.children as Array<RootContent>) {
      if (child.type !== 'text') {
        walk(child)
        children.push(child)
        continue
      }
      for (const part of splitReferences(child.value)) {
        if (typeof part === 'string') {
          children.push({ type: 'text', value: part } satisfies Text)
        } else {
          children.push({
            type: 'text',
            value: `@${part.name}`,
            data: {
              hName: 'span',
              hProperties: {
                dataRef: JSON.stringify(part),
              },
              hChildren: [{ type: 'text', value: `@${part.name}` }],
            },
          })
        }
      }
    }
    ;(node as { children: Array<RootContent> }).children = children
  }
  return (tree: Root) => walk(tree)
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
