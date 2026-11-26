import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { format, isToday } from 'date-fns'
import {
  ChevronDownIcon,
  KeyboardIcon,
  MessageSquarePlusIcon,
  MessagesSquareIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { AppFooter } from '@/components/app-footer'
import { AppNav } from '@/components/app-nav'
import { ChatMenu } from '@/components/chat/chat-menu'
import { ShortcutsDialog } from '@/components/chat/shortcuts-dialog'
import {
  ChatComposer,
  ChatThread,
  streamInto,
} from '@/components/chat/chat-thread'
import { lastConversation, refreshKey, rememberConversation } from '@/lib/chat'
import { streamChatMessage } from '@/lib/chat-stream'
import { attachmentMeta } from '@/lib/attachments'
import type { Attachment } from '@/lib/attachments'
import type { PendingMessage } from '@/components/chat/chat-thread'
import { GlobalSearch } from '@/components/global-search'
import { ProfileButton } from '@/components/profile-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { toast } from '@/components/ui/toast'
import { useCancelRequest } from '@/hooks/use-cancel-request'
import type { ChatConversation } from '@/db/schema'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import { APP_NAME } from '@/lib/config'
import { databasesQueryOptions } from '@/server/databases.functions'
import {
  assistantEnabledQueryOptions,
  assistantHistoryQueryOptions,
} from '@/server/assistant.functions'
import {
  chatConversationsQueryOptions,
  chatMessagesQueryOptions,
  deleteConversation,
  setConversationPinned,
} from '@/server/chat.functions'
import { ASSISTANT_NAME } from '@/lib/assistant'
import {
  focusChatComposer,
  isNewChatKey,
  isShortcut,
  shortcutKey,
  useShortcutLabels,
} from '@/lib/shortcuts'
import { ShortcutKey } from '@/components/shortcut-key'
import { Hint } from '@/components/hint'

// The Chat app: talk to the assistant about anything stored in the other
// apps. `?c=<id>` is the open conversation (none = a new one). Coming back
// to Chat without one reopens the conversation that was open last
// (`lastConversation`, per browser) until "New chat" starts another.
export const Route = createFileRoute('/chat')({
  validateSearch: z.object({ c: z.number().int().positive().optional() }),
  beforeLoad: async ({ search, context }) => {
    // In the browser only (the server can't know; ChatPage does it then).
    if (typeof window === 'undefined' || search.c !== undefined) return
    const last = lastConversation()
    if (last === null) return
    const conversations = await context.queryClient.ensureQueryData(
      chatConversationsQueryOptions,
    )
    if (conversations.some((c) => c.id === last)) {
      throw redirect({ to: '/chat', search: { c: last }, replace: true })
    }
    rememberConversation(null) // Deleted or expired meanwhile.
  },
  loaderDeps: ({ search }) => ({ c: search.c }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
      context.queryClient.ensureQueryData(databasesQueryOptions),
      context.queryClient.ensureQueryData(chatConversationsQueryOptions),
      deps.c !== undefined &&
        context.queryClient.ensureQueryData(chatMessagesQueryOptions(deps.c)),
    ]),
  head: () => ({ meta: [{ title: `Chat · ${APP_NAME}` }] }),
  component: ChatPage,
})

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function ChatPage() {
  const keyLabel = useShortcutLabels()
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: '/chat' })
  const { c: conversationId } = Route.useSearch()
  const { data: enabled } = useSuspenseQuery(assistantEnabledQueryOptions)
  const { data: conversations } = useSuspenseQuery(
    chatConversationsQueryOptions,
  )
  const messages = useQuery({
    ...chatMessagesQueryOptions(conversationId ?? 0),
    enabled: conversationId !== undefined,
  })

  const [pending, setPending] = useState<PendingMessage | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ChatConversation | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const dialogOpen = settingsOpen || searchOpen || helpOpen || toDelete !== null
  const current = conversations.find((c) => c.id === conversationId)

  const openConversation = (id?: number) => {
    // No id = "New chat": don't come back to the old one.
    rememberConversation(id ?? null)
    void navigate({ search: id === undefined ? {} : { c: id } })
  }

  // The open conversation is the one to come back to. Loaded straight from
  // the server without one (a reload, the installed app starting on Chat):
  // reopen the last one here, since `beforeLoad` only knows it in the browser.
  const restored = useRef(false)
  useEffect(() => {
    if (conversationId !== undefined) {
      restored.current = true
      rememberConversation(conversationId)
      return
    }
    if (restored.current) return
    restored.current = true
    const last = lastConversation()
    if (last !== null && conversations.some((c) => c.id === last)) {
      void navigate({ search: { c: last }, replace: true })
    }
  }, [conversationId])

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
          conversationId: conversationId ?? null,
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
      // Load the saved conversation before dropping the pending bubble.
      await queryClient.fetchQuery({
        ...chatMessagesQueryOptions(id),
        staleTime: 0,
      })
      openConversation(id)
      void queryClient.invalidateQueries(chatConversationsQueryOptions)
      void queryClient.invalidateQueries(assistantHistoryQueryOptions)
      for (const app of apps) {
        void queryClient.invalidateQueries({ queryKey: [refreshKey(app)] })
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

  const remove = useMutation({
    mutationFn: (id: number) => deleteConversation({ data: { id } }),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries(chatConversationsQueryOptions)
      queryClient.removeQueries(chatMessagesQueryOptions(id))
      if (id === conversationId) openConversation()
      setToDelete(null)
      toast.add({ title: 'Conversation deleted', type: 'success' })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })

  const pin = useMutation({
    mutationFn: (conversation: ChatConversation) =>
      setConversationPinned({
        data: { id: conversation.id, pinned: !conversation.pinnedAt },
      }),
    onSuccess: async (_, conversation) => {
      await queryClient.invalidateQueries(chatConversationsQueryOptions)
      toast.add({
        title: conversation.pinnedAt ? 'Unpinned' : 'Pinned',
        description: conversation.pinnedAt
          ? undefined
          : 'It stays at the top and is kept.',
        type: 'success',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't pin that",
        description: error.message,
        type: 'error',
      }),
  })

  // Keys (while not typing and no dialog is open; listed in
  // chat/shortcuts-dialog.tsx): j/k (↓/↑) step through the conversations,
  // gg/G latest/oldest, a new chat, P pin / unpin the open one, d/Delete
  // delete it (d again confirms), z search everything, Alt+H/L switch apps,
  // ? help.
  const lastG = useRef(0)
  useEffect(() => {
    if (dialogOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return
      if (isShortcut(e, 'global.globalSearch')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (isShortcut(e, 'global.help')) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      // The keys can be changed: `key` is the shortcut's default key.
      const key = shortcutKey(e, ['chat'])
      if (key === null) return
      // Arrows scroll the conversation when it has focus (j/k still step).
      if (
        (key === 'ArrowDown' || key === 'ArrowUp') &&
        e.target instanceof Element &&
        e.target.closest('[data-slot=message-scroller-viewport]')
      ) {
        return
      }
      // Conversations are listed latest first; -1 = the new chat.
      const index = conversations.findIndex((c) => c.id === conversationId)
      const go = (i: number) => {
        e.preventDefault()
        const target = conversations.at(i)
        if (target && target.id !== conversationId) {
          openConversation(target.id)
        }
      }
      switch (key) {
        case 'j':
        case 'ArrowDown':
          go(Math.min(index + 1, conversations.length - 1))
          break
        case 'k':
        case 'ArrowUp':
          if (index > 0) go(index - 1)
          break
        case 'g': {
          const now = Date.now()
          if (now - lastG.current < 500) {
            lastG.current = 0
            go(0)
          } else lastG.current = now
          break
        }
        case 'G':
          if (conversations.length) go(conversations.length - 1)
          break
        case 'd':
        case 'Delete':
          if (current) {
            e.preventDefault()
            setToDelete(current)
          }
          break
        case 'a':
          e.preventDefault()
          openConversation()
          break
        case 'P':
          if (current && !pin.isPending) {
            e.preventDefault()
            pin.mutate(current)
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Ctrl+Shift+O: a new chat, even while typing (lib/shortcuts.ts).
  useEffect(() => {
    if (dialogOpen || !enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isNewChatKey(e)) return
      e.preventDefault()
      openConversation()
      focusChatComposer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Keep the open conversation in view in the list as the keys move.
  useEffect(() => {
    if (conversationId === undefined) return
    document
      .querySelector(`[data-conversation-id="${conversationId}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [conversationId])

  const shown = conversationId === undefined ? [] : (messages.data ?? [])
  const empty = !shown.length && !pending

  return (
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col gap-4 px-4 pt-8 pb-4 sm:pb-8">
      <header className="flex items-center justify-between gap-4 max-lg:flex-col max-lg:items-stretch">
        <AppNav />
        <div className="flex justify-between gap-2">
          <Button
            aria-label="New chat"
            // Just the icon on phones, like the other apps' New buttons.
            className="max-lg:w-8 max-lg:p-0!"
            onClick={() => openConversation()}
            disabled={!enabled || conversationId === undefined}
          >
            <MessageSquarePlusIcon data-icon="inline-start" />
            <span className="max-lg:hidden">New chat</span>
            <ShortcutKey id="chat.new" className="max-lg:hidden" />
          </Button>
          <ButtonGroup aria-label="Settings">
            <Hint
              label={`Search everything (${keyLabel('global.globalSearch')})`}
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Search everything"
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon />
              </Button>
            </Hint>
            <ChatMenu
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
            />
            <Hint label={`Keyboard shortcuts (${keyLabel('global.help')})`}>
              <Button
                variant="outline"
                size="icon"
                aria-label="Keyboard shortcuts"
                onClick={() => setHelpOpen(true)}
              >
                <KeyboardIcon />
              </Button>
            </Hint>
            <ThemeToggle />
            <ProfileButton />
          </ButtonGroup>
        </div>
      </header>

      {!enabled ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquareIcon />
            </EmptyMedia>
            <EmptyTitle>Add an API key to chat</EmptyTitle>
            <EmptyDescription>
              The chat answers from your bookmarks, notes and tasks using an
              LLM: an OpenRouter or Anthropic key, set in Settings.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setSettingsOpen(true)}>
              <SettingsIcon data-icon="inline-start" />
              Open settings
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          {conversations.length > 0 && (
            <nav
              aria-label="Conversations"
              className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto md:flex"
            >
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === conversationId}
                  onOpen={() => openConversation(conversation.id)}
                  onPin={() => pin.mutate(conversation)}
                  onDelete={() => setToDelete(conversation)}
                />
              ))}
            </nav>
          )}

          <section className="flex min-w-0 flex-1 flex-col gap-3">
            {conversations.length > 0 && (
              <div className="flex gap-2 md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        className="min-w-0 flex-1 justify-between"
                      />
                    }
                  >
                    <span className="truncate">
                      {current?.title ?? 'New chat'}
                    </span>
                    <ChevronDownIcon data-icon="inline-end" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-80">
                    <DropdownMenuGroup>
                      {conversations.map((conversation) => (
                        <DropdownMenuItem
                          key={conversation.id}
                          onClick={() => openConversation(conversation.id)}
                        >
                          {conversation.pinnedAt && (
                            <PinIcon aria-label="Pinned" />
                          )}
                          <span className="truncate">{conversation.title}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {current && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={current.pinnedAt ? 'Unpin' : 'Pin'}
                    aria-pressed={current.pinnedAt !== null}
                    disabled={pin.isPending}
                    onClick={() => pin.mutate(current)}
                  >
                    {current.pinnedAt ? <PinOffIcon /> : <PinIcon />}
                  </Button>
                )}
                {current && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Delete this conversation"
                    onClick={() => setToDelete(current)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1">
              {empty ? (
                <Empty className="h-full">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessagesSquareIcon />
                    </EmptyMedia>
                    <EmptyTitle>
                      Ask {ASSISTANT_NAME} about anything you’ve saved
                    </EmptyTitle>
                    <EmptyDescription>
                      {ASSISTANT_NAME} looks through your bookmarks, notes,
                      tasks and contacts, and can add, change and delete them
                      too.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ChatThread messages={shown} pending={pending} />
              )}
            </div>

            <ChatComposer
              busy={send.isPending}
              onSend={onSend}
              onCancel={() => request.cancel()}
              enabled={!dialogOpen}
            />
          </section>
        </div>
      )}

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          {toDelete && (
            <DeleteConfirm
              conversation={toDelete}
              pending={remove.isPending}
              onDelete={() => remove.mutate(toDelete.id)}
            />
          )}
        </AlertDialogContent>
      </AlertDialog>
      <AppFooter />
    </main>
  )
}

function ConversationRow({
  conversation,
  active,
  onOpen,
  onPin,
  onDelete,
}: {
  conversation: ChatConversation
  active: boolean
  onOpen: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const pinned = conversation.pinnedAt !== null
  return (
    <div
      className="group/row flex items-center gap-0.5"
      data-conversation-id={conversation.id}
    >
      <Button
        variant={active ? 'secondary' : 'ghost'}
        aria-current={active ? 'page' : undefined}
        className="h-auto min-w-0 flex-1 flex-col items-start gap-0 py-1.5"
        onClick={onOpen}
      >
        <span className="w-full truncate text-left">{conversation.title}</span>
        <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
          {pinned && <PinIcon aria-label="Pinned" className="size-3" />}
          {format(
            conversation.updatedAt,
            isToday(conversation.updatedAt) ? 'HH:mm' : 'd MMM',
          )}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${pinned ? 'Unpin' : 'Pin'} “${conversation.title}”`}
        aria-pressed={pinned}
        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        onClick={onPin}
      >
        {pinned ? <PinOffIcon /> : <PinIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete “${conversation.title}”`}
        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}

function DeleteConfirm({
  conversation,
  pending,
  onDelete,
}: {
  conversation: ChatConversation
  pending: boolean
  onDelete: () => void
}) {
  useConfirmKey(() => {
    if (!pending) onDelete()
  })
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
        <AlertDialogDescription>
          “{conversation.title}” and its messages are deleted. Tasks and notes
          it created stay.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={pending}
          onClick={onDelete}
        >
          Delete
          <ShortcutKey id="global.confirm" />
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
