import { useEffect } from 'react'

import { popupOpen } from '@/components/app-switcher'
import { useAppSwitch } from '@/hooks/use-app-switch'

// On phones (below `lg`), a quick horizontal swipe switches app: left goes
// to the next one, right to the previous (in `APPS` order, wrapping, like
// Shift+L / Shift+H). Mounted once, in `__root.tsx`. Left alone: swipes that
// start in a field, in something that scrolls sideways, next to the
// screen's edges (the browser's own back / forward), with two fingers, while a dialog / menu is
// open or while text is selected. Opt out with `data-no-swipe`.

/** How far (px) and how fast (ms) a swipe must go, and how much more
 * sideways than up / down. */
const MIN_DISTANCE = 80
const MAX_DURATION = 700
const SIDEWAYS = 2
/** The screen's edges belong to the browser's back / forward gesture. */
const EDGE = 24

const IGNORE =
  'input, textarea, select, [contenteditable="true"], [data-no-swipe]'

/** Inside something that scrolls sideways (a wide table, a chip row…). */
function inSideScroller(target: Element) {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el === document.body) return false
    if (el.scrollWidth > el.clientWidth + 1) {
      const { overflowX } = getComputedStyle(el)
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
  }
  return false
}

export function SwipeApps() {
  const switchApp = useAppSwitch()

  useEffect(() => {
    const phone = window.matchMedia('(max-width: 1023.98px)')
    let start: { x: number; y: number; at: number } | null = null

    const onStart = (e: TouchEvent) => {
      start = null
      if (!phone.matches || e.touches.length !== 1 || popupOpen()) return
      const touch = e.touches[0]
      const target = e.target
      if (!(target instanceof Element) || target.closest(IGNORE)) return
      if (touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE) {
        return
      }
      if (inSideScroller(target)) return
      start = { x: touch.clientX, y: touch.clientY, at: e.timeStamp }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) start = null // Pinch zoom.
    }
    const onEnd = (e: TouchEvent) => {
      const from = start
      start = null
      if (!from || e.changedTouches.length !== 1) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (
        Math.abs(dx) < MIN_DISTANCE ||
        Math.abs(dx) < SIDEWAYS * Math.abs(dy) ||
        e.timeStamp - from.at > MAX_DURATION ||
        popupOpen() ||
        !(window.getSelection()?.isCollapsed ?? true)
      ) {
        return
      }
      switchApp(dx < 0 ? 1 : -1)
    }
    const cancel = () => {
      start = null
    }

    // Capture: rows with a long-press menu stop their touches from
    // bubbling.
    const options = { passive: true, capture: true }
    window.addEventListener('touchstart', onStart, options)
    window.addEventListener('touchmove', onMove, options)
    window.addEventListener('touchend', onEnd, options)
    window.addEventListener('touchcancel', cancel, options)
    return () => {
      window.removeEventListener('touchstart', onStart, options)
      window.removeEventListener('touchmove', onMove, options)
      window.removeEventListener('touchend', onEnd, options)
      window.removeEventListener('touchcancel', cancel, options)
    }
  }, [switchApp])

  return null
}
