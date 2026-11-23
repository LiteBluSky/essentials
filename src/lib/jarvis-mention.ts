import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

// "Mention in Jarvis": the global search (or anything else) drops a
// reference like `@note(Name#12)` into Jarvis's prompt box, so a found item
// can be asked about or used in a request. Whichever prompt is on screen
// takes it (the field, the panel or Chat's box: `useMentionTarget`); with
// none on screen it waits (`pending`) for Chat's box, which the caller
// navigates to.

const EVENT = 'jarvis:mention'
let pending: string | null = null

/** Hand `text` to the prompt on screen; false if none took it (it's kept
 * for the next prompt that mounts: go to Chat). */
export function mentionInJarvis(text: string): boolean {
  const event = new CustomEvent<string>(EVENT, {
    detail: text,
    cancelable: true,
  })
  window.dispatchEvent(event)
  if (event.defaultPrevented) return true
  pending = text
  return false
}

/** Put `text` at the end of a (React-controlled) textarea with
 * `execCommand`, so React sees it and undo works, and leave the caret
 * after it. */
export function insertAtEnd(field: HTMLTextAreaElement, text: string) {
  field.focus()
  const end = field.value.length
  field.setSelectionRange(end, end)
  const gap = field.value && !/\s$/.test(field.value) ? ' ' : ''
  document.execCommand('insertText', false, `${gap}${text} `)
}

function visible(el: HTMLElement | null) {
  return !!el && el.getClientRects().length > 0
}

/** Make a prompt box take mentions while `enabled` and on screen; it also
 * takes one left waiting when it mounts. */
export function useMentionTarget(
  field: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean,
) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (pending !== null && enabled && visible(field.current)) {
      const text = pending
      pending = null
      requestAnimationFrame(
        () => field.current && insertAtEnd(field.current, text),
      )
    }
    const onMention = (e: Event) => {
      if (e.defaultPrevented || !enabledRef.current) return
      if (!visible(field.current)) return
      e.preventDefault()
      const text = (e as CustomEvent<string>).detail
      requestAnimationFrame(
        () => field.current && insertAtEnd(field.current, text),
      )
    }
    window.addEventListener(EVENT, onMention)
    return () => window.removeEventListener(EVENT, onMention)
  }, [field, enabled])
}

/** For a container that can show a prompt on demand (the closed panel):
 * `open` it and fill its box on the next frame. */
export function useMentionOpener(
  enabled: boolean,
  open: () => HTMLTextAreaElement | null | Promise<HTMLTextAreaElement | null>,
) {
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (!enabled) return
    const onMention = (e: Event) => {
      if (e.defaultPrevented) return
      e.preventDefault()
      const text = (e as CustomEvent<string>).detail
      void Promise.resolve(openRef.current()).then((field) => {
        if (field) insertAtEnd(field, text)
        else pending = text
      })
    }
    window.addEventListener(EVENT, onMention)
    return () => window.removeEventListener(EVENT, onMention)
  }, [enabled])
}
