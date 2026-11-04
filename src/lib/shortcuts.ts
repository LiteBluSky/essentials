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
