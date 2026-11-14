import { useEffect, useRef } from 'react'

import { AppFooter } from '@/components/app-footer'
import { cn } from '@/lib/utils'

/**
 * On phones (below `lg`: a Z Fold opened and upright tablets too), floats its content at the bottom of the screen,
 * like Chat's message box: on a solid band in the page's colour, the page
 * going behind it and fading out just above it. Over the page
 * (`z-40`) but under dialogs, menus
 * and popovers (`z-50`). Its height goes into `--dock-height` on <html>:
 * the page's `<main>` gets that much bottom padding (inside its
 * `min-h-dvh`, so a short page doesn't scroll) and the toasts sit above it
 * (styles.css). From `lg` up it stays where it is in
 * the page. Used by Ask Jarvis. On phones the app footer (database in use,
 * version) sits under its content, so it's always in view.
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
        'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:px-3 max-lg:pt-2 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        // A solid band in the page's colour, like under Chat's box: the
        // page goes behind it, fading out just above it (a short gradient
        // over the band's top edge, which lets taps through).
        'max-lg:bg-background',
        'max-lg:before:pointer-events-none max-lg:before:absolute max-lg:before:inset-x-0 max-lg:before:bottom-full max-lg:before:h-8 max-lg:before:bg-linear-to-t max-lg:before:from-background max-lg:before:to-transparent',
        // The field looks as in Chat, made opaque so the page doesn't show
        // through it (dark mode: its 30% input tint over the background).
        'max-lg:[&_[data-slot=input-group]]:bg-background dark:max-lg:[&_[data-slot=input-group]]:bg-[color-mix(in_oklch,var(--input)_30%,var(--background))]',
      )}
    >
      {children}
      <AppFooter inDock />
    </div>
  )
}
