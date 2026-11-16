// Server-only: cancelling a Jarvis request that's under way. The browser
// gives each request an id; "Stop" sends that id to `cancelRequest`, which
// aborts the run (the model call is dropped, no further tool runs, and what
// the run already changed is undone: agent.server.ts). Kept in memory: a
// request only lives as long as its HTTP call.

const running = new Map<string, AbortController>()
/** Cancelled before the request itself arrived (id → when). */
const early = new Map<string, number>()
const EARLY_TTL_MS = 60_000

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

export function isCancelled(error: unknown): error is CancelledError {
  return error instanceof CancelledError
}

/** Registers a request: its abort signal, and `done` to call at its end. */
export function trackRequest(id: string | undefined) {
  const controller = new AbortController()
  if (id === undefined) return { signal: controller.signal, done: () => {} }
  const cutoff = Date.now() - EARLY_TTL_MS
  for (const [key, at] of early) if (at < cutoff) early.delete(key)
  if (early.delete(id)) controller.abort()
  running.set(id, controller)
  return {
    signal: controller.signal,
    done: () => {
      if (running.get(id) === controller) running.delete(id)
    },
  }
}

export function cancelRequest(id: string) {
  const controller = running.get(id)
  if (controller) controller.abort()
  else early.set(id, Date.now())
}
