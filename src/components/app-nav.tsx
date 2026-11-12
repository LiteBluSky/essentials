import { Link, useLocation } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { APPS } from '@/lib/apps'

// Each app page renders its own navbar, so where it was scrolled to is kept
// here across app switches.
let savedScrollLeft = 0

// Switches between the bundled apps (also Shift+H / Shift+L). Scrolls
// sideways when the apps don't fit, following the current app (smoothly, as
// you switch); on phones (below `sm`) only the icons show, each keeping its
// name for screen readers and as a tooltip.
export function AppNav() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const navRef = useRef<HTMLElement>(null)

  // Pick up where the previous page's navbar was, then glide the current
  // app to the middle.
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    nav.scrollLeft = savedScrollLeft
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    nav.scrollTo({
      left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [pathname])

  return (
    <nav
      ref={navRef}
      aria-label="Apps"
      className="relative flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onScroll={(e) => {
        savedScrollLeft = e.currentTarget.scrollLeft
      }}
    >
      {APPS.map(({ path, name, icon: Icon }) => {
        const active = pathname.startsWith(path)
        return (
          <Button
            key={path}
            variant={active ? 'secondary' : 'ghost'}
            className="shrink-0"
            nativeButton={false}
            aria-current={active ? 'page' : undefined}
            title={name}
            render={<Link to={path} />}
          >
            <Icon data-icon="inline-start" />
            <span className="max-sm:sr-only">{name}</span>
          </Button>
        )
      })}
    </nav>
  )
}
