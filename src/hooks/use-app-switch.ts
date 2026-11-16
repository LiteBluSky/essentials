import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'

import { APPS } from '@/lib/apps'

// Steps to the previous / next app in the navbar (wrapping around), for the
// Alt+H / Alt+L shortcuts (and the phone swipe). The new app's page slides
// in like a Calendar month: the next one from the right, the previous one
// from the left.
export function useAppSwitch() {
  const navigate = useNavigate()
  const router = useRouter()
  const pathname = useLocation({ select: (l) => l.pathname })

  return useCallback(
    (step: -1 | 1) => {
      const current = APPS.findIndex((app) => pathname.startsWith(app.path))
      const next = APPS[(current + step + APPS.length) % APPS.length]
      // Once its page has rendered (not if the navigation went elsewhere).
      const unsubscribe = router.subscribe('onRendered', (e) => {
        unsubscribe()
        if (e.toLocation.pathname.startsWith(next.path)) slideIn(step)
      })
      void navigate({ to: next.path })
    },
    [navigate, router, pathname],
  )
}

// Same distance, time and easing as the Calendar's month slide
// (`SLIDE_FROM` / `SLIDE_MS` in routes/calendar.tsx), sideways.
const SLIDE_FROM = 48
const SLIDE_MS = 220
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/** Slides the new page in from the side it came from: everything in its
 * `<main>` but the header (the navbar and the app's buttons stay put, so
 * only the content moves). Each part is moved with `left` (made
 * `relative`), not a transform, which would carry the fixed Jarvis field /
 * panel inside it along; parts that are already positioned out of the flow
 * are left alone. The page is clipped sideways meanwhile so it doesn't
 * flash a scrollbar. Not with reduced motion. */
function slideIn(step: -1 | 1) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const main = document.querySelector('main')
  if (!main) return
  const parts = [...main.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.tagName !== 'HEADER' &&
      ['static', 'relative'].includes(getComputedStyle(el).position),
  )
  if (!parts.length) return
  const root = document.documentElement
  root.style.overflowX = 'clip'
  let running = parts.length
  for (const el of parts) {
    const { position } = el.style
    el.style.position = 'relative'
    const animation = el.animate(
      [
        { left: `${step * SLIDE_FROM}px`, opacity: 0 },
        { left: '0px', opacity: 1 },
      ],
      { duration: SLIDE_MS, easing: EASING },
    )
    const done = () => {
      el.style.position = position
      if (--running === 0) root.style.overflowX = ''
    }
    animation.onfinish = done
    animation.oncancel = done
  }
}
