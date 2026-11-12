import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FolderIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Spinner } from '@/components/ui/spinner'
import { APPS } from '@/lib/apps'
import {
  REFERENCE_TYPES,
  formatReference,
  referenceQuery,
} from '@/lib/references'
import type { ReferenceQuery } from '@/lib/references'
import { globalSearch } from '@/server/search.functions'

type Field = HTMLTextAreaElement | HTMLInputElement

const POPUP_WIDTH = 288
const POPUP_MAX_HEIGHT = 280
const MAX_ITEMS = 8
const DEBOUNCE_MS = 150

// Copied onto the hidden mirror that measures where the caret is.
const MIRROR_STYLES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const

/** The caret's position inside the field (from its border box, ignoring
 * scrolling) and the line height, measured with a hidden copy of it. */
function caretCoords(el: Field, index: number) {
  const computed = getComputedStyle(el)
  const mirror = document.createElement('div')
  const style = mirror.style as unknown as Record<string, string>
  const source = computed as unknown as Record<string, string>
  for (const name of MIRROR_STYLES) style[name] = source[name]
  const isInput = el instanceof HTMLInputElement
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    overflow: 'hidden',
    whiteSpace: isInput ? 'pre' : 'pre-wrap',
    overflowWrap: 'break-word',
  })
  mirror.textContent = el.value.slice(0, index)
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(index) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const lineHeight =
    parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.4
  const coords = {
    top: marker.offsetTop + parseFloat(computed.borderTopWidth),
    left: marker.offsetLeft + parseFloat(computed.borderLeftWidth),
    height: lineHeight,
  }
  mirror.remove()
  return coords
}

/** Replaces `start`–`end` of the field with `text` as if typed, so the
 * field's own undo and change handling keep working. */
function replaceRange(el: Field, start: number, end: number, text: string) {
  el.focus()
  el.setSelectionRange(start, end)
  if (document.execCommand('insertText', false, text)) return
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    'value',
  )?.set
  setter?.call(el, el.value.slice(0, start) + text + el.value.slice(end))
  el.setSelectionRange(start + text.length, start + text.length)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

type Option = {
  key: string
  label: string
  path?: string
  icon: typeof FolderIcon
  apply: (el: Field) => void
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

const appIcon = (app: string) =>
  APPS.find((a) => a.path === `/${app}`)?.icon ?? FolderIcon

/**
 * `@` suggestions for a text field (render it next to the field, passing its
 * ref). Typing `@` lists the item types, `@contact(` then searches that app
 * as you type (the global search), and picking one inserts
 * `@contact(Name#id)`. ↑/↓ choose, Enter / Tab pick, Esc closes; the keys
 * are taken before the field's own handlers (and a dialog's Esc) while the
 * list is open.
 */
export function ReferenceAutocomplete({
  target,
}: {
  target: RefObject<Field | null>
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState<ReferenceQuery | null>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
    above: boolean
  } | null>(null)
  const [active, setActive] = useState(0)
  // The `@` whose list was closed with Esc stays closed until it's gone.
  const dismissed = useRef<number | null>(null)

  const itemQuery = query?.stage === 'item' ? query.query.trim() : ''
  const debounced = useDebounced(itemQuery, DEBOUNCE_MS)
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => globalSearch({ data: { query: debounced } }),
    enabled: query?.stage === 'item',
    placeholderData: keepPreviousData,
    staleTime: 0,
  })

  const options: Array<Option> = []
  if (query?.stage === 'type') {
    for (const t of REFERENCE_TYPES) {
      if (!t.type.startsWith(query.query)) continue
      options.push({
        key: `type:${t.type}`,
        label: t.label,
        path: `@${t.type}(…)`,
        icon: appIcon(t.app),
        apply: (el) =>
          replaceRange(
            el,
            query.start,
            el.selectionStart ?? query.start,
            `@${t.type}(`,
          ),
      })
    }
  } else if (query?.stage === 'item') {
    const app = REFERENCE_TYPES.find((t) => t.type === query.type)!.app
    const items = (results.data?.[app] ?? [])
      .filter((r) => r.kind === 'item')
      .slice(0, MAX_ITEMS)
    for (const item of items) {
      options.push({
        key: `item:${item.id}`,
        label: item.label,
        path: item.path,
        icon: appIcon(app),
        apply: (el) => {
          const caret = el.selectionStart ?? el.value.length
          // Picking inside an existing reference replaces all of it.
          const rest = /^[^()\n]*\)/.exec(el.value.slice(caret))
          const end = caret + (rest?.[0].length ?? 0)
          const next = el.value.charAt(end)
          const space = next && /\s/.test(next) ? '' : ' '
          replaceRange(
            el,
            query.start,
            end,
            formatReference(query.type, item.label, item.id) + space,
          )
        },
      })
    }
  }
  const searching =
    query?.stage === 'item' && (results.isPending || itemQuery !== debounced)
  const open = query !== null && (options.length > 0 || searching)
  const current = Math.min(active, Math.max(options.length - 1, 0))

  // The listeners below read the latest of these.
  const latest = useRef({ open, options, current })
  latest.current = { open, options, current }
  const shown = useRef(query)
  shown.current = query

  useEffect(() => {
    const el = target.current
    if (!el) return

    const refresh = () => {
      const caret = el.selectionStart
      if (
        document.activeElement !== el ||
        caret === null ||
        caret !== el.selectionEnd
      ) {
        setQuery(null)
        return
      }
      const next = referenceQuery(el.value.slice(0, caret))
      if (!next) dismissed.current = null
      if (!next || dismissed.current === next.start) {
        setQuery(null)
        return
      }
      const prev = shown.current
      if (
        prev?.stage !== next.stage ||
        prev.start !== next.start ||
        prev.query !== next.query
      ) {
        setActive(0)
      }
      setQuery(next)

      // Where the list goes: under the caret, or above it when there's no
      // room below (e.g. the chat box at the bottom of the page).
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) return
      const box = el.getBoundingClientRect()
      const at = caretCoords(el, next.start)
      const top = box.top + at.top - el.scrollTop
      const left = box.left + at.left - el.scrollLeft
      const above =
        top + at.height + POPUP_MAX_HEIGHT > window.innerHeight &&
        top > POPUP_MAX_HEIGHT
      const clampedLeft = Math.max(
        8,
        Math.min(left, window.innerWidth - POPUP_WIDTH - 8),
      )
      setPosition({
        top: (above ? top - 4 : top + at.height + 4) - anchor.top,
        left: clampedLeft - anchor.left,
        above,
      })
    }

    const onKeyDown = (e: Event) => {
      const event = e as KeyboardEvent
      const { open: isOpen, options: list, current: index } = latest.current
      if (!isOpen || event.isComposing) return
      const take = () => {
        event.preventDefault()
        // Not the field's own handlers, nor a dialog's Esc.
        event.stopPropagation()
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        take()
        if (!list.length) return
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive((index + step + list.length) % list.length)
      } else if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const option = list.at(index)
        if (!option) return
        take()
        option.apply(el)
      } else if (event.key === 'Escape') {
        take()
        const caret = el.selectionStart ?? 0
        dismissed.current =
          referenceQuery(el.value.slice(0, caret))?.start ?? null
        setQuery(null)
      }
    }

    const onBlur = () => setQuery(null)
    // After the browser has moved the caret.
    const onKeyUp = (e: Event) => {
      const { key } = e as KeyboardEvent
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(key)) refresh()
    }

    el.addEventListener('input', refresh)
    el.addEventListener('click', refresh)
    el.addEventListener('keyup', onKeyUp)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('input', refresh)
      el.removeEventListener('click', refresh)
      el.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('blur', onBlur)
    }
  }, [target])

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected=true]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [current, open])

  const heading =
    query?.stage === 'item'
      ? REFERENCE_TYPES.find((t) => t.type === query.type)?.label
      : 'Link to'

  return (
    <div ref={anchorRef} className="absolute">
      {open && position && (
        <div
          className="absolute z-50"
          style={{
            top: position.top,
            left: position.left,
            width: POPUP_WIDTH,
            transform: position.above ? 'translateY(-100%)' : undefined,
          }}
          // Clicking an option mustn't take the focus from the field.
          onMouseDown={(e) => e.preventDefault()}
        >
          <Command
            shouldFilter={false}
            loop
            value={options.at(current)?.key ?? ''}
            onValueChange={(value) => {
              const index = options.findIndex((o) => o.key === value)
              if (index !== -1) setActive(index)
            }}
            className="border shadow-md"
          >
            <CommandList ref={listRef} style={{ maxHeight: POPUP_MAX_HEIGHT }}>
              <CommandEmpty>
                {searching ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Searching…
                  </span>
                ) : (
                  'Nothing found.'
                )}
              </CommandEmpty>
              {options.length > 0 && (
                <CommandGroup heading={heading}>
                  {options.map((option) => (
                    <CommandItem
                      key={option.key}
                      value={option.key}
                      onSelect={() => {
                        const el = target.current
                        if (el) option.apply(el)
                      }}
                    >
                      <option.icon />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                        <span className="truncate">{option.label}</span>
                        {option.path && (
                          <span className="max-w-1/2 shrink-0 truncate text-xs text-muted-foreground">
                            {option.path}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
