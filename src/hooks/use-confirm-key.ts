import { useEffect, useRef } from 'react'

import { isShortcut } from '@/lib/shortcuts'

// While mounted (e.g. inside a delete confirmation), pressing the confirm
// key (`d` by default: `global.confirm`) runs `onConfirm` — so `d` then `d`
// deletes. Held-key repeats are ignored, so holding the key that opened the
// dialog doesn't confirm it.
export function useConfirmKey(onConfirm: () => void) {
  const latest = useRef(onConfirm)
  latest.current = onConfirm

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented) return
      if (!isShortcut(e, 'global.confirm')) return
      e.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
