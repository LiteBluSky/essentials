import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { toast } from '@/components/ui/toast'
import { requestOpen } from '@/lib/global-search'
import type { Reference } from '@/lib/references'
import { resolveReference } from '@/server/search.functions'

/**
 * Opens what a `@type(name#id)` reference points at, like picking it in the
 * global search: a bookmark opens its site in a new tab, anything else
 * switches to its app and opens there. Gone (and no other item has that
 * name): a toast says so.
 */
export function useOpenReference() {
  const navigate = useNavigate()

  return useCallback(
    async (ref: Reference) => {
      // Opened now, while it's still the click, or popup blockers stop it;
      // pointed at the site once it's known.
      const tab = ref.app === 'bookmarks' ? window.open('', '_blank') : null
      try {
        const found = await resolveReference({
          data: { app: ref.app, id: ref.id, name: ref.name },
        })
        if (!found) throw new Error(`Couldn't find “${ref.name}”`)
        if (ref.app === 'bookmarks') {
          if (!found.url) throw new Error(`Couldn't find “${ref.name}”`)
          if (tab) {
            tab.opener = null
            tab.location.href = found.url
          } else {
            window.open(found.url, '_blank', 'noreferrer')
          }
          return
        }
        requestOpen({ app: ref.app, kind: 'item', id: found.id })
        void navigate({ to: `/${ref.app}` })
      } catch (error) {
        tab?.close()
        toast.add({
          title: error instanceof Error ? error.message : "Couldn't open it",
          description: 'It may have been deleted or renamed.',
          type: 'warning',
        })
      }
    },
    [navigate],
  )
}
