import { Link, useLocation } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { APPS } from '@/lib/apps'

// Switches between the bundled apps (also Shift+H / Shift+L).
export function AppNav() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <nav aria-label="Apps" className="flex gap-1">
      {APPS.map(({ path, name, icon: Icon }) => {
        const active = pathname.startsWith(path)
        return (
          <Button
            key={path}
            variant={active ? 'secondary' : 'ghost'}
            nativeButton={false}
            aria-current={active ? 'page' : undefined}
            render={<Link to={path} />}
          >
            <Icon data-icon="inline-start" />
            {/* Narrow phones: only the current app keeps its name. */}
            <span className={active ? undefined : 'max-[420px]:sr-only'}>
              {name}
            </span>
          </Button>
        )
      })}
    </nav>
  )
}
