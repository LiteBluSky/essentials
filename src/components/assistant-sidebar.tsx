import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  MessagesSquareIcon,
  PanelRightCloseIcon,
  SparklesIcon,
  SquarePenIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  ChatComposer,
  ChatThread,
  streamInto,
} from '@/components/chat/chat-thread'
import { refreshKey, rememberConversation } from '@/lib/chat'
import { streamChatMessage } from '@/lib/chat-stream'
import { attachmentMeta } from '@/lib/attachments'
import type { Attachment } from '@/lib/attachments'
import type { PendingMessage } from '@/components/chat/chat-thread'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useCancelRequest } from '@/hooks/use-cancel-request'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { focusChatComposer, isNewChatKey, isShortcut } from '@/lib/shortcuts'
import { useMentionOpener } from '@/lib/jarvis-mention'
import { cn } from '@/lib/utils'
import { assistantHistoryQueryOptions } from '@/server/assistant.functions'
import {
  chatConversationsQueryOptions,
  chatMessagesQueryOptions,
} from '@/server/chat.functions'
import { ShortcutKey } from '@/components/shortcut-key'

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
      const hide = isShortcut(e, 'global.hideAssistant')
      if (!hide && !isShortcut(e, 'global.assistant')) return
      e.preventDefault()
      if (hide) {
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

  // An item mentioned from the global search while the panel is closed:
  // open it, then its box takes the mention.
  useMentionOpener(
    enabled && desktop && !open,
    () =>
      new Promise((resolve) => {
        toggle(true)
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(panel.current?.querySelector('textarea') ?? null),
          ),
        )
      }),
  )

  // Ctrl+Shift+O, even while typing: a new conversation in the panel
  // (opening it), or below `xl` (no panel) a new chat in Chat.
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isNewChatKey(e)) return
      e.preventDefault()
      if (!desktop) {
        rememberConversation(null) // A new chat, not the last one open.
        void navigate({ to: '/chat', search: {} }).then(() =>
          focusChatComposer(),
        )
        return
      }
      toggle(true)
      startOver(null)
      if (panel.current) focusChatComposer(panel.current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const request = useCancelRequest()
  const send = useMutation({
    mutationFn: ({
      text,
      webSearch,
      files,
      requestId,
      signal,
    }: {
      text: string
      webSearch: boolean
      files: Array<Attachment>
      requestId: string
      signal: AbortSignal
    }) =>
      streamChatMessage(
        {
          // A conversation deleted meanwhile (or expired) starts a new one.
          conversationId: messages.length ? conversationId : null,
          text,
          attachments: files,
          now: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          webSearch,
          requestId,
        },
        (event) => setPending((p) => streamInto(p, event)),
        signal,
      ),
  })

  const onSend = async (
    text: string,
    webSearch: boolean,
    files: Array<Attachment>,
  ) => {
    setPending({ text, files: attachmentMeta(files), answer: '', tool: null })
    const started = request.start({ web: webSearch })
    let conversation: number | null = null
    let failure: string | undefined
    try {
      const { conversationId: id, apps } = await send.mutateAsync({
        text,
        webSearch,
        files,
        ...started,
      })
      conversation = id
      await queryClient.fetchQuery({
        ...chatMessagesQueryOptions(id),
        staleTime: 0,
      })
      startOver(id)
      void queryClient.invalidateQueries(chatConversationsQueryOptions)
      void queryClient.invalidateQueries(assistantHistoryQueryOptions)
      for (const app of new Set(apps.map(refreshKey))) {
        void queryClient.invalidateQueries({ queryKey: [app] })
      }
      return true
    } catch (error) {
      // Stopped by the user (the Jarvis indicator says so): the message
      // goes back into the box.
      if (request.wasCancelled(started.requestId)) return false
      failure = error instanceof Error ? error.message : String(error)
      toast.add({
        title: "Couldn't send that",
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      })
      return false
    } finally {
      request.finish(started.requestId, {
        conversationId: conversation,
        error: failure,
      })
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
            {ASSISTANT_NAME} <ShortcutKey id="global.assistant" />
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
            <ChatThread
              messages={messages}
              pending={pending}
              className="px-3"
            />
          )}
        </div>

        <div className="p-3 pt-0">
          <ChatComposer
            busy={send.isPending}
            onSend={onSend}
            onCancel={() => request.cancel()}
            // `s` is handled here (it opens the panel too).
            enabled={false}
            mentions={enabled && desktop}
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
