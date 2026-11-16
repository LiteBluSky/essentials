import { useEffect, useRef } from 'react'

import { overlayOpen } from '@/components/app-switcher'
import { useToastManager } from '@/components/ui/toast'

/**
 * Esc dismisses the toasts on screen (all of them), from anywhere: while one
 * shows, the app-level keys (Alt+H / Alt+L, `f`, `p`, Shift+T, the swipe)
 * are off, so this is how the keyboard gets them back. Mounted once, inside
 * the `<Toaster>`. An Esc something else took (a dialog or menu, a tree's
 * cut, stopping Jarvis) is left alone.
 */
export function ToastEscape() {
  const { toasts, close } = useToastManager()
  const live = useRef(false)
  live.current = toasts.some((t) => t.transitionStatus !== 'ending')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat) return
      if (!live.current || overlayOpen()) return
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  return null
}
