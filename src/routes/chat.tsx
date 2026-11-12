import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { format, isToday } from 'date-fns'
import {
  ChevronDownIcon,
  KeyboardIcon,
  MessageSquarePlusIcon,
  MessagesSquareIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { AppNav } from '@/components/app-nav'
import { ChatMenu } from '@/components/chat/chat-menu'
import { ShortcutsDialog } from '@/components/chat/shortcuts-dialog'
import { ChatComposer, ChatThread } from '@/components/chat/chat-thread'
import type { PendingMessage } from '@/components/chat/chat-thread'
import { GlobalSearch } from '@/components/global-search'
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
import { Kbd } from '@/components/ui/kbd'
import { toast } from '@/components/ui/toast'
import type { ChatConversation } from '@/db/schema'
import { useAppSwitch } from '@/hooks/use-app-switch'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import { APP_NAME } from '@/lib/config'
import {
  assistantEnabledQueryOptions,
  assistantHistoryQueryOptions,
} from '@/server/assistant.functions'
import {
  chatConversationsQueryOptions,
  chatMessagesQueryOptions,
  deleteConversation,
  sendChatMessage,
} from '@/server/chat.functions'

// The Chat app: talk to the assistant about anything stored in the other
// apps. `?c=<id>` is the open conversation (none = a new one).
export const Route = createFileRoute('/chat')({
  validateSearch: z.object({ c: z.number().int().positive().optional() }),
  loaderDeps: ({ search }) => ({ c: search.c }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
      context.queryClient.ensureQueryData(chatConversationsQueryOptions),
      deps.c !== undefined &&
        context.queryClient.ensureQueryData(chatMessagesQueryOptions(deps.c)),
    ]),
  head: () => ({ meta: [{ title: `Chat · ${APP_NAME}` }] }),
  component: ChatPage,
})

const EXAMPLES = [
  'What tasks are due this week?',
  'What did I write about the CRM?',
  'Which links do I have about invoices?',
  'Add a note with my packing list: passport, charger, sunscreen',
]

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function ChatPage() {
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

  const openConversation = (id?: number) =>
    void navigate({ search: id === undefined ? {} : { c: id } })

  const send = useMutation({
    mutationFn: (text: string) =>
      sendChatMessage({
        data: {
          conversationId: conversationId ?? null,
          text,
          now: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
  })

  const onSend = async (text: string) => {
    setPending({ text })
    try {
      const { conversationId: id, result } = await send.mutateAsync(text)
      // Load the saved conversation before dropping the pending bubble.
      await queryClient.fetchQuery({
        ...chatMessagesQueryOptions(id),
        staleTime: 0,
      })
      openConversation(id)
      void queryClient.invalidateQueries(chatConversationsQueryOptions)
      void queryClient.invalidateQueries(assistantHistoryQueryOptions)
      for (const app of new Set(
        [...result.created, ...result.changed].map((item) => item.app),
      )) {
        void queryClient.invalidateQueries({ queryKey: [app, 'tree'] })
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

  // Keys (while not typing and no dialog is open; listed in
  // chat/shortcuts-dialog.tsx): j/k (↓/↑) step through the conversations,
  // gg/G latest/oldest, a new chat, d/Delete delete the open one (d again
  // confirms), z search everything, Shift+H/L switch apps, ? help.
  const switchApp = useAppSwitch()
  const lastG = useRef(0)
  useEffect(() => {
    if (dialogOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      // Arrows scroll the conversation when it has focus (j/k still step).
      if (
        (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
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
      switch (e.key) {
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
        case 'z':
          e.preventDefault()
          setSearchOpen(true)
          break
        case '?':
          e.preventDefault()
          setHelpOpen(true)
          break
        case 'H':
        case 'L':
          e.preventDefault()
          switchApp(e.key === 'H' ? -1 : 1)
          break
      }
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
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:py-8">
      <header className="flex items-center justify-between gap-4 max-[500px]:flex-col max-[500px]:items-stretch">
        <AppNav />
        <div className="flex justify-between gap-2">
          <Button
            onClick={() => openConversation()}
            disabled={!enabled || conversationId === undefined}
          >
            <MessageSquarePlusIcon data-icon="inline-start" />
            New chat
            <Kbd className="max-sm:hidden">a</Kbd>
          </Button>
          <ButtonGroup aria-label="Settings">
            <Button
              variant="outline"
              size="icon"
              aria-label="Search everything"
              title="Search everything (z)"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </Button>
            <ChatMenu
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              onClick={() => setHelpOpen(true)}
            >
              <KeyboardIcon />
            </Button>
            <ThemeToggle />
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
                    <EmptyTitle>Ask about anything you’ve saved</EmptyTitle>
                    <EmptyDescription>
                      It looks through your bookmarks, notes and tasks, and can
                      add tasks and notes too.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent className="flex-row flex-wrap justify-center">
                    {EXAMPLES.map((example) => (
                      <Button
                        key={example}
                        variant="outline"
                        size="sm"
                        disabled={send.isPending}
                        onClick={() => void onSend(example)}
                      >
                        {example}
                      </Button>
                    ))}
                  </EmptyContent>
                </Empty>
              ) : (
                <ChatThread messages={shown} pending={pending} />
              )}
            </div>

            <ChatComposer
              busy={send.isPending}
              onSend={onSend}
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
    </main>
  )
}

function ConversationRow({
  conversation,
  active,
  onOpen,
  onDelete,
}: {
  conversation: ChatConversation
  active: boolean
  onOpen: () => void
  onDelete: () => void
}) {
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
        <span className="text-xs font-normal text-muted-foreground">
          {format(
            conversation.updatedAt,
            isToday(conversation.updatedAt) ? 'HH:mm' : 'd MMM',
          )}
        </span>
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
  useConfirmKey('d', () => {
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
          <Kbd>d</Kbd>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
