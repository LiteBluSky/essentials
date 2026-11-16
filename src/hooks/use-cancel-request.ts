import { useRef } from 'react'

import { cancelAssistant } from '@/server/assistant.functions'

/** A v4 UUID. `crypto.randomUUID` needs a secure origin (not plain http on
 * the LAN), `getRandomValues` doesn't. */
function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Cancelling a Jarvis request (every Jarvis prompt has a Stop button while
 * one runs). `start()` gives the request its id (sent along as `requestId`)
 * and an abort signal for a `fetch`; `cancel()` tells the server to call it
 * off (it stops and undoes what the request had changed) and aborts the
 * signal; `wasCancelled(id)` tells a late error apart from a real one.
 */
export function useCancelRequest() {
  const current = useRef<{ id: string; controller: AbortController } | null>(
    null,
  )
  const cancelled = useRef(new Set<string>())
  return {
    start() {
      const request = { id: uuid(), controller: new AbortController() }
      current.current = request
      return { requestId: request.id, signal: request.controller.signal }
    },
    /** Returns whether there was a request to cancel. */
    cancel() {
      const request = current.current
      if (!request) return false
      current.current = null
      cancelled.current.add(request.id)
      // Never rejects loudly: at worst the request just runs to its end.
      cancelAssistant({ data: { requestId: request.id } }).catch(() => {})
      request.controller.abort()
      return true
    },
    /** The request ended on its own. */
    finish(id: string) {
      if (current.current?.id === id) current.current = null
    },
    wasCancelled: (id: string) => cancelled.current.has(id),
  }
}
