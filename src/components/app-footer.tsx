import { useQuery } from '@tanstack/react-query'
import { CloudIcon, HardDriveIcon } from 'lucide-react'

import { APP_VERSION } from '@/lib/config'
import { cn } from '@/lib/utils'
import { databasesQueryOptions } from '@/server/databases.functions'

/**
 * The strip at the bottom of every app but Calendar: the database in use
 * (Local or the remote's name, from Settings → Database) on the left, the
 * running version on the right. Pushed to the bottom with `mt-auto`, so the
 * page's `<main>` needs `min-h-dvh` (or a fixed height). On phones, with
 * the Jarvis field showing, it's under the field instead (`inDock`, in
 * `MobileDock`; styles.css hides the page's own), so it's always in view.
 */
export function AppFooter({ inDock = false }: { inDock?: boolean }) {
  const { data } = useQuery(databasesQueryOptions)
  const active =
    data?.activeId == null
      ? null
      : data.databases.find((d) => d.id === data.activeId)
  const Icon = active ? CloudIcon : HardDriveIcon

  return (
    <footer
      data-app-footer
      data-in-dock={inDock || undefined}
      className={cn(
        'flex items-center justify-between gap-4 text-xs text-muted-foreground',
        inDock ? 'px-1 pt-2 lg:hidden' : 'mt-auto',
      )}
    >
      <span
        className="flex min-w-0 items-center gap-1.5"
        title={active ? active.url : data?.localPath}
      >
        {data && (
          <>
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{active ? active.name : 'Local'}</span>
          </>
        )}
      </span>
      <span className="shrink-0 tabular-nums">v{APP_VERSION}</span>
    </footer>
  )
}
