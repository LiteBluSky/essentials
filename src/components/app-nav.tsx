import { Link, useLocation } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { APPS } from '@/lib/apps'

// Switches between the bundled apps (also Shift+H / Shift+L): one icon per
// app, the current one highlighted, its name in a tooltip on hover (and as
// the accessible name).
export function AppNav() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <TooltipProvider>
      <nav aria-label="Apps" className="flex gap-1">
        {APPS.map(({ path, name, icon: Icon }) => {
          const active = pathname.startsWith(path)
          return (
            <Tooltip key={path}>
              <TooltipTrigger
                render={
                  <Button
                    variant={active ? 'secondary' : 'ghost'}
                    size="icon"
                    nativeButton={false}
                    aria-label={name}
                    aria-current={active ? 'page' : undefined}
                    render={<Link to={path} />}
                  />
                }
              >
                <Icon />
              </TooltipTrigger>
              <TooltipContent side="bottom">{name}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </TooltipProvider>
  )
}
