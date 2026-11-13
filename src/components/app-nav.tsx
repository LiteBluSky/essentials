import { Link, useLocation, useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { APPS } from '@/lib/apps'

// Switches between the bundled apps (also Shift+H / Shift+L, and `f`):
// from `sm` up, one icon per app, the current one highlighted, its name in
// a tooltip on hover (and as the accessible name); on phones, a select
// showing the current app's icon and name, listing every app the same way.
export function AppNav() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const current = APPS.find((app) => pathname.startsWith(app.path))

  return (
    <>
      <AppSelect current={current?.path ?? null} />
      <TooltipProvider>
        <nav aria-label="Apps" className="flex gap-1 max-sm:hidden">
          {APPS.map(({ path, name, icon: Icon }) => {
            const active = path === current?.path
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
    </>
  )
}

const ITEMS = APPS.map((app) => ({ value: app.path, label: app.name }))

/** Phones: the apps in a select, each with its icon and name. */
function AppSelect({ current }: { current: string | null }) {
  const navigate = useNavigate()
  return (
    <Select
      items={ITEMS}
      value={current}
      onValueChange={(path) => {
        if (path && path !== current) void navigate({ to: path })
      }}
    >
      <SelectTrigger aria-label="Switch app" className="w-full sm:hidden">
        <SelectValue>
          {(path: string | null) => <AppLabel path={path} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {APPS.map((app) => (
            <SelectItem key={app.path} value={app.path}>
              <AppLabel path={app.path} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function AppLabel({ path }: { path: string | null }) {
  const app = APPS.find((a) => a.path === path)
  if (!app) return null
  const Icon = app.icon
  return (
    <span className="flex items-center gap-2">
      <Icon />
      {app.name}
    </span>
  )
}
