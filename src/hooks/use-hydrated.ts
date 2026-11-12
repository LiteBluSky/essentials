import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False on the server and during hydration, true afterwards. Task ages are
 * calendar days in the browser's timezone, which the server can't know, so
 * they're only computed once this is true (no hydration mismatch).
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
