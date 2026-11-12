import type { KeyboardEvent } from 'react'

/**
 * Ctrl+Enter (⌘+Enter on macOS) submits the form from any field, so saving
 * never needs tabbing to the button. Put it on the `<form>` as
 * `onKeyDownCapture`: capture runs before the fields' own keys (a textarea's
 * newline, a picker's Enter, the `@` list), so it always wins.
 */
export function submitOnModEnter(submit: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
    if (e.altKey || e.shiftKey) return
    e.preventDefault()
    e.stopPropagation()
    submit()
  }
}
