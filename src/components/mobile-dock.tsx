import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * On phones (below `lg`: a Z Fold opened and upright tablets too), floats its content at the bottom of the screen,
 * like Chat's message box: the page fades out under it (a gradient, no
 * border or solid band; taps go through the faded part). Over the page
 * (`z-40`) but under dialogs, menus
 * and popovers (`z-50`). Its height goes into `--dock-height` on <html>:
 * the page's `<main>` gets that much bottom padding (inside its
 * `min-h-dvh`, so a short page doesn't scroll) and the toasts sit above it
 * (styles.css). From `lg` up it stays where it is in
 * the page. Used by Ask Jarvis and Finances' quick entry.
 */
export function MobileDock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const update = () =>
      root.style.setProperty('--dock-height', `${el.offsetHeight}px`)
    const observer = new ResizeObserver(update)
    observer.observe(el)
    update()
    return () => {
      observer.disconnect()
      root.style.removeProperty('--dock-height')
    }
  }, [])
  return (
    <div
      ref={ref}
      data-mobile-dock
      className={cn(
        'max-lg:pointer-events-none max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:px-3 max-lg:pt-10 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        // The page fades out under it, instead of a solid band with a line.
        'max-lg:bg-linear-to-t max-lg:from-background max-lg:from-45% max-lg:to-transparent',
        // Only its content takes taps: the faded strip lets them through.
        'max-lg:*:pointer-events-auto',
        // The field looks as in Chat, made opaque so the page doesn't show
        // through it (dark mode: its 30% input tint over the background).
        'max-lg:[&_[data-slot=input-group]]:bg-background dark:max-lg:[&_[data-slot=input-group]]:bg-[color-mix(in_oklch,var(--input)_30%,var(--background))]',
      )}
    >
      {children}
    </div>
  )
}
