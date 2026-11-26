import { useNavigate } from '@tanstack/react-router'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleSlashIcon,
  MessagesSquareIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef } from 'react'

import { overlayOpen } from '@/components/app-switcher'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import { Spinner } from '@/components/ui/spinner'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { rememberConversation } from '@/lib/chat'
import type { Activity } from '@/lib/jarvis-activity'
import {
  cancelActivity,
  dismissActivity,
  useActivities,
} from '@/lib/jarvis-activity'
import { Hint } from '@/components/hint'

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * What Jarvis is doing, on every page (mounted once in `__root.tsx`): a
 * small bar centred in the space above the header, so it never covers the
 * navbar. While a request runs: a spinner and Stop (Esc too, when not
 * typing and nothing else wants it); a request that finished while its
 * prompt was gone (another app) leaves "Open in Chat" until dismissed.
 * Deliberately not a toast: toasts count as dialogs and hold the app keys
 * and the swipe, and this must leave them free.
 */
export function JarvisActivity() {
  const activities = useActivities()
  const navigate = useNavigate()
  const running = activities.filter((a) => a.state === 'running')

  // Esc stops the latest request. On `document`, so it comes before the Esc
  // that dismisses toasts (on `window`).
  const latest = useRef<Activity | undefined>(undefined)
  latest.current = running.at(-1)
  const busy = running.length > 0
  useEffect(() => {
    if (!busy) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat) return
      if (isTyping(e.target) || overlayOpen() || !latest.current) return
      e.preventDefault()
      cancelActivity(latest.current.id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy])

  const shown = activities.at(-1)
  if (!shown) return null

  const openChat = (conversationId: number) => {
    dismissActivity(shown.id)
    rememberConversation(conversationId)
    void navigate({ to: '/chat', search: { c: conversationId } })
  }

  return (
    <div
      role="status"
      aria-live="polite"
      // In the `pt-8` every page leaves above its header; under dialogs and
      // menus (z-50). Phones' swipe ignores it.
      className="pointer-events-none fixed inset-x-0 top-1 z-40 flex justify-center px-4"
      data-no-swipe
    >
      <ButtonGroup className="pointer-events-auto max-w-full rounded-md bg-background shadow-sm">
        {shown.state === 'running' ? (
          <>
            <ButtonGroupText className="h-6 min-w-0 gap-1.5 text-xs">
              <Spinner />
              <span className="truncate">
                {ASSISTANT_NAME} is{' '}
                {shown.web ? 'searching the web' : 'working'}…
                {running.length > 1 && ` (${running.length})`}
              </span>
            </ButtonGroupText>

            <Button
              variant="outline"
              size="xs"
              onClick={() => cancelActivity(shown.id)}
            >
              <SquareIcon data-icon="inline-start" className="fill-current" />
              Stop
            </Button>
          </>
        ) : (
          <>
            <ButtonGroupText className="h-6 min-w-0 gap-1.5 text-xs">
              {shown.state === 'done' ? (
                <CircleCheckIcon className="text-success" />
              ) : shown.state === 'failed' ? (
                <CircleAlertIcon className="text-destructive" />
              ) : (
                <CircleSlashIcon />
              )}
              <Hint label={shown.error}>
                <span className="truncate">
                  {shown.state === 'done'
                    ? `${ASSISTANT_NAME} is done`
                    : shown.state === 'failed'
                      ? `${ASSISTANT_NAME} couldn't do that`
                      : 'Stopped · nothing was done'}
                </span>
              </Hint>
            </ButtonGroupText>
            {shown.state !== 'stopped' && shown.conversationId !== null && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => openChat(shown.conversationId!)}
              >
                <MessagesSquareIcon data-icon="inline-start" />
                Open in Chat
              </Button>
            )}
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => dismissActivity(shown.id)}
            >
              <XIcon />
            </Button>
          </>
        )}
      </ButtonGroup>
    </div>
  )
}
