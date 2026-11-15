import { useEffect, useRef } from 'react'

// Global keyboard shortcuts. Ctrl on Windows/Linux, ⌘ on macOS. Keys chosen
// to avoid ones browsers reserve or users rely on (Ctrl+L/N/T/W/F).
export const SHORTCUTS = {
  search: { key: 'k', label: 'K' },
  newFolder: { key: 'g', label: 'G' },
} as const

export type ShortcutName = keyof typeof SHORTCUTS

export const MOD_LABEL = 'Ctrl'

export function useShortcuts(
  handlers: Partial<Record<ShortcutName, () => void>>,
  enabled = true,
) {
  // Keep the listener stable while always calling the latest handlers.
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      // The note editor uses Ctrl+B etc. for formatting and marks them handled.
      if (e.defaultPrevented) return
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const key = e.key.toLowerCase()
      for (const [name, shortcut] of Object.entries(SHORTCUTS)) {
        const handler = latest.current[name as ShortcutName]
        if (shortcut.key === key && handler) {
          e.preventDefault()
          handler()
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/** Ctrl+Shift+O (⌘⇧O): a new chat with the assistant, from anywhere (even
 * while typing): Chat's page starts one, the desktop panel starts one, and
 * elsewhere (no panel) it opens a new chat in Chat. */
export function isNewChatKey(e: KeyboardEvent) {
  return (
    (e.ctrlKey || e.metaKey) &&
    e.shiftKey &&
    !e.altKey &&
    e.key.toLowerCase() === 'o'
  )
}

/** Alt+H / Alt+L (previous / next app): -1 / 1, else null. */
export function appSwitchStep(e: KeyboardEvent): -1 | 1 | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  if (e.code === 'KeyH') return -1
  if (e.code === 'KeyL') return 1
  return null
}

export const NEW_CHAT_KEYS = [MOD_LABEL, 'Shift', 'O']

/** Focus the chat message box once it's rendered. */
export function focusChatComposer(within: ParentNode = document) {
  requestAnimationFrame(() =>
    within
      .querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea')
      ?.focus(),
  )
}
