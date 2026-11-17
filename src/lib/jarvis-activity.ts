import { useSyncExternalStore } from 'react'

import { cancelAssistant } from '@/server/assistant.functions'

// What Jarvis is doing, for the whole page (every prompt: the Ask field, the
// panel, Chat's box, Advice), kept outside React so it survives switching
// apps (each page renders its own prompt). `JarvisActivity`
// (components/jarvis-activity.tsx) shows it: a spinner with Stop while a
// request runs, then "Open in Chat" once one finished out of sight. The
// prompts reach it through `useCancelRequest`.

export type Activity = {
  /** The request's id (sent along as `requestId`). */
  id: string
  state: 'running' | 'done' | 'failed' | 'stopped'
  web: boolean
  /** Where the answer was saved, once known. */
  conversationId: number | null
  error?: string
}

type Running = {
  controller: AbortController
  /** The prompt that started it, while it's on screen: put its text back. */
  onCancel?: () => void
}

let activities: Array<Activity> = []
const running = new Map<string, Running>()
const cancelled = new Set<string>()
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function set(next: Array<Activity>) {
  activities = next
  listeners.forEach((listener) => listener())
}

function update(id: string, patch: Partial<Activity>) {
  set(activities.map((a) => (a.id === id ? { ...a, ...patch } : a)))
}

/** Drops one from the indicator (now, or after `ms`). */
export function dismissActivity(id: string, ms = 0) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  if (ms > 0) {
    timers.set(
      id,
      setTimeout(() => dismissActivity(id), ms),
    )
    return
  }
  set(activities.filter((a) => a.id !== id))
}

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

/** A request starts: its id and an abort signal for a `fetch`. */
export function startActivity({
  web = false,
  onCancel,
}: { web?: boolean; onCancel?: () => void } = {}) {
  const id = uuid()
  const controller = new AbortController()
  running.set(id, { controller, onCancel })
  // Finished ones are old news once another starts.
  set([
    ...activities.filter((a) => a.state === 'running'),
    { id, state: 'running', web, conversationId: null },
  ])
  return { requestId: id, signal: controller.signal }
}

/** Stop: the server calls it off (and undoes what it had changed), the
 * fetch is aborted. Returns whether it was still running. */
export function cancelActivity(id: string) {
  const request = running.get(id)
  if (!request) return false
  running.delete(id)
  cancelled.add(id)
  // Never rejects loudly: at worst the request just runs to its end.
  cancelAssistant({ data: { requestId: id } }).catch(() => {})
  request.controller.abort()
  update(id, { state: 'stopped' })
  dismissActivity(id, 3000)
  request.onCancel?.()
  return true
}

export function wasCancelled(id: string) {
  return cancelled.has(id)
}

/**
 * The request ended on its own. `seen`: the prompt that started it is still
 * on screen and shows the result, so the indicator just goes; otherwise it
 * stays with "Open in Chat" (or the error) until dismissed.
 */
export function finishActivity(
  id: string,
  {
    seen,
    conversationId = null,
    error,
  }: { seen: boolean; conversationId?: number | null; error?: string },
) {
  running.delete(id)
  if (cancelled.has(id)) return
  if (seen) {
    dismissActivity(id)
    return
  }
  update(id, {
    state: error === undefined ? 'done' : 'failed',
    conversationId,
    error,
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const NONE: Array<Activity> = []

/** What Jarvis is doing now (and what finished out of sight). */
export function useActivities() {
  return useSyncExternalStore(
    subscribe,
    () => activities,
    () => NONE,
  )
}
