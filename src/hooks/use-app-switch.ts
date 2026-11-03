import { useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { APPS } from '@/lib/apps'

// Steps to the previous / next app in the navbar (wrapping around), for the
// Shift+H / Shift+L shortcuts.
export function useAppSwitch() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (l) => l.pathname })

  return useCallback(
    (step: -1 | 1) => {
      const current = APPS.findIndex((app) => pathname.startsWith(app.path))
      const next = APPS[(current + step + APPS.length) % APPS.length]
      void navigate({ to: next.path })
    },
    [navigate, pathname],
  )
}
