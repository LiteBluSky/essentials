import { useEffect, useRef } from 'react'

import {
  cancelActivity,
  finishActivity,
  startActivity,
  wasCancelled,
} from '@/lib/jarvis-activity'

/**
 * Cancelling a Jarvis request (every Jarvis prompt has a Stop button while
 * one runs), and showing it in the Jarvis indicator (lib/jarvis-activity.ts),
 * whose Stop works too, even after the prompt is gone (another app).
 * `start()` gives the request its id (sent along as `requestId`) and an
 * abort signal for a `fetch`; `cancel()` tells the server to call it off (it
 * stops and undoes what the request had changed) and aborts the signal;
 * `finish()` says it ended (with where its answer was saved);
 * `wasCancelled(id)` tells a late error apart from a real one. `onCancel`
 * runs however it was stopped, while this prompt is still on screen.
 */
export function useCancelRequest(onCancel?: () => void) {
  const current = useRef<string | null>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return {
    start({ web = false }: { web?: boolean } = {}) {
      const started = startActivity({
        web,
        onCancel: () => {
          if (mounted.current) onCancelRef.current?.()
        },
      })
      current.current = started.requestId
      return started
    },
    /** Returns whether there was a request to cancel. */
    cancel() {
      const id = current.current
      if (!id) return false
      current.current = null
      return cancelActivity(id)
    },
    /** The request ended on its own (`error` = it failed). */
    finish(
      id: string,
      result: { conversationId?: number | null; error?: string } = {},
    ) {
      if (current.current === id) current.current = null
      finishActivity(id, { ...result, seen: mounted.current })
    },
    wasCancelled,
  }
}
