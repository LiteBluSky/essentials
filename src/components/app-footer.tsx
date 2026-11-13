import { useQuery } from '@tanstack/react-query'
import { CloudIcon, HardDriveIcon } from 'lucide-react'

import { APP_VERSION } from '@/lib/config'
import { databasesQueryOptions } from '@/server/databases.functions'

/**
 * The strip at the bottom of every app but Calendar: the database in use
 * (Local or the remote's name, from Settings → Database) on the left, the
 * running version on the right. Pushed to the bottom with `mt-auto`, so the
 * page's `<main>` needs `min-h-dvh` (or a fixed height).
 */
export function AppFooter() {
  const { data } = useQuery(databasesQueryOptions)
  const active =
    data?.activeId == null
      ? null
      : data.databases.find((d) => d.id === data.activeId)
  const Icon = active ? CloudIcon : HardDriveIcon

  return (
    <footer className="text-muted-foreground mt-auto flex items-center justify-between gap-4 text-xs">
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
