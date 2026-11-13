import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  MessagesSquareIcon,
  PanelRightCloseIcon,
  SparklesIcon,
  SquarePenIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ChatComposer, ChatThread } from '@/components/chat/chat-thread'
import type { PendingMessage } from '@/components/chat/chat-thread'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { toast } from '@/components/ui/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { cn } from '@/lib/utils'
import {
  assistantEnabledQueryOptions,
  assistantHistoryQueryOptions,
} from '@/server/assistant.functions'
import {
  chatConversationsQueryOptions,
  chatMessagesQueryOptions,
  sendChatMessage,
} from '@/server/chat.functions'

// Desktop (`xl` and up): Jarvis as a chat panel floating on the right of
// every app with the Ask Jarvis field, instead of the field in the page.
// It's a real conversation (Chat's thread, markers with Open / Undo, and
// composer), carried on across requests and pages until "New"; the same
// conversation shows in Chat. Collapsed, it's a round button in the corner.
// The page makes room for it (styles.css: body:has([data-jarvis-sidebar])).

const DESKTOP = '(min-width: 80rem)'
const OPEN_KEY = 'assistant:sidebar'
const CONVERSATION_KEY = 'assistant:conversation'

/** Whether the sidebar is the Jarvis shown (xl and up); false on the
 * server and below `xl`. */
export function useDesktopAssistant() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  )
}

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not kept; fine.
  }
}

/** Just the panel, for apps without the Ask Jarvis field (Finances,
 * Calendar); nothing without an API key. Their loader prefetches
 * `assistantEnabledQueryOptions`. */
export function JarvisSidebar({ enabled }: { enabled: boolean }) {
  const { data: available } = useSuspenseQuery(assistantEnabledQueryOptions)
  return available ? <AssistantSidebar enabled={enabled} /> : null
}

export function AssistantSidebar({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const desktop = useDesktopAssistant()
  const panel = useRef<HTMLElement>(null)
  // Open by default; both remembered per browser (after hydration).
  const [open, setOpen] = useState(true)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [pending, setPending] = useState<PendingMessage | null>(null)
  useEffect(() => {
    setOpen(read(OPEN_KEY) !== 'closed')
    const id = Number(read(CONVERSATION_KEY))
    if (Number.isInteger(id) && id > 0) setConversationId(id)
  }, [])

  const toggle = (next: boolean) => {
    setOpen(next)
    write(OPEN_KEY, next ? null : 'closed')
  }
  const startOver = (id: number | null) => {
    setConversationId(id)
    write(CONVERSATION_KEY, id === null ? null : String(id))
  }

  const { data: messages = [] } = useQuery({
    ...chatMessagesQueryOptions(conversationId ?? 0),
    enabled: desktop && conversationId !== null,
  })

  // `s` focuses the message box (opening the panel first), Shift+S hides
  // the panel; not while typing or with a dialog open.
  useEffect(() => {
    if (!enabled || !desktop) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (
        (e.key !== 's' && e.key !== 'S') ||
        (t instanceof HTMLElement &&
          (t.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)))
      )
        return
      e.preventDefault()
      if (e.key === 'S') {
        toggle(false)
        return
      }
      toggle(true)
      requestAnimationFrame(() =>
        panel.current?.querySelector('textarea')?.focus(),
      )
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, desktop])

  const send = useMutation({
    mutationFn: ({ text, webSearch }: { text: string; webSearch: boolean }) =>
      sendChatMessage({
        data: {
          // A conversation deleted meanwhile (or expired) starts a new one.
          conversationId: messages.length ? conversationId : null,
          text,
          now: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          webSearch,
        },
      }),
  })

  const onSend = async (text: string, webSearch: boolean) => {
    setPending({ text })
    try {
      const { conversationId: id, result } = await send.mutateAsync({
        text,
        webSearch,
      })
      await queryClient.fetchQuery({
        ...chatMessagesQueryOptions(id),
        staleTime: 0,
      })
      startOver(id)
      void queryClient.invalidateQueries(chatConversationsQueryOptions)
      void queryClient.invalidateQueries(assistantHistoryQueryOptions)
      for (const app of new Set(
        [...result.created, ...result.changed].map((item) =>
          item.app === 'subscriptions' || item.app === 'budgets'
            ? 'finances'
            : item.app,
        ),
      )) {
        void queryClient.invalidateQueries({ queryKey: [app] })
      }
      return true
    } catch (error) {
      toast.add({
        title: "Couldn't send that",
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      })
      return false
    } finally {
      setPending(null)
    }
  }

  const empty = messages.length === 0 && !pending

  return (
    <TooltipProvider>
      {/* Collapsed: a round button in the corner. */}
      {!open && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-lg"
                className="fixed right-5 bottom-5 z-30 rounded-full shadow-lg max-xl:hidden"
                aria-label={`Open ${ASSISTANT_NAME}`}
                onClick={() => toggle(true)}
              />
            }
          >
            <SparklesIcon />
          </TooltipTrigger>
          <TooltipContent side="left">
            {ASSISTANT_NAME} <Kbd>s</Kbd>
          </TooltipContent>
        </Tooltip>
      )}
      <aside
        ref={panel}
        aria-label={ASSISTANT_NAME}
        data-jarvis-sidebar
        data-open={open}
        className={cn(
          'fixed top-3 right-3 bottom-3 z-30 flex w-96 flex-col overflow-hidden rounded-2xl border bg-background/80 shadow-xl backdrop-blur-xl max-xl:hidden',
          !open && 'hidden',
        )}
      >
        <header className="flex items-center gap-2 px-4 pt-3 pb-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <SparklesIcon className="size-4" />
          </span>
          <h2 className="flex-1 font-medium">{ASSISTANT_NAME}</h2>
          <SidebarButton
            label="New conversation"
            disabled={conversationId === null || send.isPending}
            onClick={() => startOver(null)}
          >
            <SquarePenIcon />
          </SidebarButton>
          <SidebarButton
            label="Open in Chat"
            disabled={conversationId === null}
            onClick={() =>
              void navigate({
                to: '/chat',
                search: { c: conversationId ?? undefined },
              })
            }
          >
            <MessagesSquareIcon />
          </SidebarButton>
          <SidebarButton label="Hide" onClick={() => toggle(false)}>
            <PanelRightCloseIcon />
          </SidebarButton>
        </header>

        <div className="min-h-0 flex-1">
          {empty ? (
            <div className="flex h-full flex-col justify-end p-4">
              <p className="text-sm text-muted-foreground">
                Ask {ASSISTANT_NAME} to add, find or change anything: tasks,
                notes, links, contacts, the calendar or money.
              </p>
            </div>
          ) : (
            <ChatThread messages={messages} pending={pending} />
          )}
        </div>

        <div className="p-3 pt-0">
          <ChatComposer
            busy={send.isPending}
            onSend={onSend}
            // `s` is handled here (it opens the panel too).
            enabled={false}
          />
        </div>
      </aside>
    </TooltipProvider>
  )
}

function SidebarButton({
  label,
  children,
  ...props
}: {
  label: string
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
