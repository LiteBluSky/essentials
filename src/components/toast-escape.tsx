import { useEffect, useRef } from 'react'

import { overlayOpen } from '@/components/app-switcher'
import { useToastManager } from '@/components/ui/toast'
import { isShortcut } from '@/lib/shortcuts'

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

/**
 * `u` presses the Undo of the newest notification offering one (Jarvis's
 * changes, a completed task), from anywhere but a text field. Caught in the
 * capture phase while such a notification shows, so it wins over an app's
 * own `u` (Passwords' copy username, Finances' Recurring tab) only then.
 * Mounted once, inside the `<Toaster>`, next to `ToastEscape`.
 */
export function ToastUndo() {
  const { toasts, close } = useToastManager()
  const latest = useRef(toasts)
  latest.current = toasts

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !isShortcut(e, 'global.undo')) {
        return
      }
      if (overlayOpen()) return
      // Newest first (Base UI adds a toast at the front).
      const toast = latest.current.find(
        (t) =>
          t.transitionStatus !== 'ending' && t.actionProps?.children === 'Undo',
      )
      const onClick = toast?.actionProps?.onClick
      if (!toast || !onClick) return
      e.preventDefault()
      e.stopPropagation()
      onClick(new MouseEvent('click') as never)
      close(toast.id)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [close])

  return null
}
