import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { APPS } from '@/lib/apps'

// Switches between the bundled apps (also Shift+H / Shift+L). Scrolls
// sideways when the apps don't fit; on phones (below `sm`) only the icons
// show, each keeping its name for screen readers and as a tooltip.
export function AppNav() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const navRef = useRef<HTMLElement>(null)

  // Keep the current app in view when the bar is scrolled.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <nav
      ref={navRef}
      aria-label="Apps"
      className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
