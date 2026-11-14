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
    // The fade above it only shows while there's page behind it: the page
    // scrolls and isn't at its end yet.
    const covering = () => {
      const below = root.scrollHeight - (window.scrollY + window.innerHeight)
      el.toggleAttribute('data-covering', below > 1)
    }
    const update = () => {
      root.style.setProperty('--dock-height', `${el.offsetHeight}px`)
      covering()
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    observer.observe(document.body)
    update()
    window.addEventListener('scroll', covering, { passive: true })
    window.addEventListener('resize', covering)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', covering)
      window.removeEventListener('resize', covering)
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
        // over the band's top edge, which lets taps through) while there's
        // page behind it (`data-covering`).
        'max-lg:bg-background',
        'max-lg:data-covering:before:pointer-events-none max-lg:data-covering:before:absolute max-lg:data-covering:before:inset-x-0 max-lg:data-covering:before:bottom-full max-lg:data-covering:before:h-8 max-lg:data-covering:before:bg-linear-to-t max-lg:data-covering:before:from-background max-lg:data-covering:before:to-transparent',
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
