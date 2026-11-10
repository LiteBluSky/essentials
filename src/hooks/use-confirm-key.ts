import { useEffect, useRef } from 'react'

// While mounted (e.g. inside a delete confirmation), pressing `key` with no
// modifiers runs `onConfirm` — so `d` then `d` deletes. Held-key repeats are
// ignored, so holding the key that opened the dialog doesn't confirm it.
export function useConfirmKey(key: string, onConfirm: () => void) {
  const latest = useRef(onConfirm)
  latest.current = onConfirm

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== key || e.repeat || e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key])
}
