import { createFileRoute, redirect } from '@tanstack/react-router'

import { APPS } from '@/lib/apps'

// No page of its own: open the first app.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: APPS[0].path })
  },
})
