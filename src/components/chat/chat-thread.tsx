import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  ArrowUpIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  NotebookPenIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Kbd } from '@/components/ui/kbd'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import type { ChatMessage } from '@/db/schema'
import type { AssistantFound, AssistantItem } from '@/lib/assistant'
import { messageActions } from '@/lib/chat'
import { requestOpen } from '@/lib/global-search'
import { ChatMarkdown } from './chat-markdown'

/** A message being sent (shown before the server has saved it). */
export type PendingMessage = { text: string }

// The conversation (shadcn message + bubble, in a message scroller that
// sticks to the latest message) and what each answer created / found, with
// Open buttons.
export function ChatThread({
  messages,
  pending,
}: {
  messages: Array<ChatMessage>
  pending: PendingMessage | null
}) {
  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-1 py-4">
            {messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={String(message.id)}
                scrollAnchor={message.role === 'user'}
              >
                <ChatBubble message={message} />
              </MessageScrollerItem>
            ))}
            {pending && (
              <>
                <MessageScrollerItem messageId="pending" scrollAnchor>
                  <Message align="end">
                    <MessageContent>
                      <Bubble>
                        <BubbleContent className="whitespace-pre-wrap">
                          {pending.text}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
                <MessageScrollerItem scrollAnchor={false}>
                  <Marker role="status">
                    <MarkerIcon>
                      <Spinner />
                    </MarkerIcon>
                    <MarkerContent>Looking it up…</MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent className="whitespace-pre-wrap">
              {message.content}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }
  const actions = messageActions(message)
  return (
    <Message>
      <MessageContent>
        {actions && (
          <div className="flex flex-col gap-1.5">
            {actions.created.map((item) => (
              <CreatedMarker key={`${item.app}-${item.id}`} item={item} />
            ))}
            {actions.found.map((found, i) => (
              <FoundMarker key={i} found={found} />
            ))}
          </div>
        )}
        <Bubble variant={message.error ? 'destructive' : 'ghost'}>
          <BubbleContent>
            {message.error ? (
              message.content
            ) : (
              <ChatMarkdown>{message.content}</ChatMarkdown>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

function useOpen() {
  const navigate = useNavigate()
  return (target: {
    app: AssistantItem['app'] | 'bookmarks'
    id: number
    kind?: 'folder' | 'item'
  }) => {
    requestOpen({ app: target.app, kind: target.kind ?? 'item', id: target.id })
    void navigate({ to: `/${target.app}` })
  }
}

function CreatedMarker({ item }: { item: AssistantItem }) {
  const open = useOpen()
  const Icon = item.app === 'tasks' ? ListChecksIcon : NotebookPenIcon
  const title = item.title.split('\n')[0]
  return (
    <Marker>
      <MarkerIcon>
        <Icon />
      </MarkerIcon>
      <MarkerContent>
        {item.app === 'tasks' ? 'Task added' : 'Note added'}: {title}
        {item.app === 'tasks' && item.dueAt
          ? ` · due ${format(item.dueAt, 'EEE d MMM HH:mm')}`
          : ''}
      </MarkerContent>
      <Button size="xs" variant="outline" onClick={() => open(item)}>
        Open
      </Button>
    </Marker>
  )
}

function FoundMarker({ found: { query, match } }: { found: AssistantFound }) {
  const open = useOpen()
  if (!match) {
    return (
      <Marker>
        <MarkerIcon>
          <SearchXIcon />
        </MarkerIcon>
        <MarkerContent>Nothing found for “{query}”</MarkerContent>
      </Marker>
    )
  }
  return (
    <Marker>
      <MarkerIcon>
        <SearchIcon />
      </MarkerIcon>
      <MarkerContent>
        {match.label}
        {match.path ? ` · ${match.path}` : ''}
      </MarkerContent>
      {match.url ? (
        <Button
          size="xs"
          variant="outline"
          nativeButton={false}
          render={<a href={match.url} target="_blank" rel="noreferrer" />}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          Open
        </Button>
      ) : (
        <Button size="xs" variant="outline" onClick={() => open(match)}>
          Open
        </Button>
      )}
    </Marker>
  )
}

/**
 * The message box under the conversation: Enter sends, Shift+Enter is a
 * new line, Esc leaves it (so Shift+H / Shift+L and `z` work). `s` (or a
 * tap) comes back. Not focused on its own.
 */
export function ChatComposer({
  busy,
  onSend,
  enabled,
}: {
  busy: boolean
  onSend: (text: string) => Promise<boolean>
  /** `s` focuses it (no dialog open). */
  enabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (e.key !== 's' || typing) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  const send = async () => {
    const message = text.trim()
    if (!message || busy) return
    setText('')
    // Put it back if it didn't go through.
    if (!(await onSend(message))) setText(message)
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          ref={ref}
          rows={1}
          className="max-h-48 min-h-10 overflow-y-auto"
          aria-label="Message"
          placeholder="Ask about your bookmarks, notes and tasks…"
          enterKeyHint="send"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault()
              void send()
            } else if (e.key === 'Escape') {
              e.currentTarget.blur()
            }
          }}
        />
        <InputGroupAddon align="block-end" className="p-2">
          {!text && <Kbd className="max-sm:hidden">s</Kbd>}
          <InputGroupButton
            variant="default"
            size="icon-sm"
            type="submit"
            className="ml-auto"
            disabled={!text.trim() || busy}
            aria-label="Send"
            title="Send (Enter)"
          >
            {busy ? <Spinner /> : <ArrowUpIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
