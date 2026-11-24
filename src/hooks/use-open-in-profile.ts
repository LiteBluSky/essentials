import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { toast } from '@/components/ui/toast'
import { keepSwitchNotice } from '@/lib/databases'
import { requestOpen, requestOpenAfterReload } from '@/lib/global-search'
import type { SearchApp, SearchTarget } from '@/lib/global-search'
import {
  databasesQueryOptions,
  switchDatabase,
} from '@/server/databases.functions'

export type OpenInProfile = {
  /** The profile it's in: null = Local, else a remote database's id. */
  profile: number | null
  /** The page to go to. */
  to: `/${SearchApp}` | '/calendar' | '/finances'
  /** What to open there (none: just the page). */
  target?: SearchTarget
}

/**
 * Opens something Jarvis made, changed, found or referred to in a profile
 * (database) that may not be the one in use: in the one in use it opens like
 * a global search pick; in another, that profile is switched to first
 * (server-wide, like the profile switcher), the page reloads there and the
 * item opens, with a toast saying which profile is now in use.
 */
export function useOpenInProfile() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useCallback(
    async ({ profile, to, target }: OpenInProfile) => {
      try {
        const view = await queryClient.ensureQueryData(databasesQueryOptions)
        if (profile === view.activeId) {
          if (target) requestOpen(target)
          void navigate({ to })
          return
        }
        const name =
          profile === null
            ? 'Local'
            : view.databases.find((d) => d.id === profile)?.name
        if (!name) throw new Error('That profile was removed')
        await switchDatabase({ data: { id: profile } })
        if (target) requestOpenAfterReload(target)
        keepSwitchNotice(name)
        // Every app's data changed: start over from the server, there.
        window.location.assign(to)
      } catch (error) {
        toast.add({
          title: "Couldn't switch profile",
          description: error instanceof Error ? error.message : undefined,
          type: 'error',
        })
      }
    },
    [queryClient, navigate],
  )
}
