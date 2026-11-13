import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  ArrowUpIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  NotebookPenIcon,
  SearchIcon,
  SearchXIcon,
  FolderPlusIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { DictateButton } from '@/components/dictate-button'
import { WebSearchToggle } from '@/components/web-search-toggle'
import { ReferenceAutocomplete } from '@/components/reference-autocomplete'
import { ReferenceText } from '@/components/reference'
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
import { toast } from '@/components/ui/toast'
import { useDictation } from '@/hooks/use-dictation'
import type {
  AssistantFound,
  AssistantItem,
  ChangeSummary,
} from '@/lib/assistant'
import { messageActions } from '@/lib/chat'
import type { ChatMessageView } from '@/lib/chat'
import { useUndoRun } from '@/hooks/use-undo-run'
import { requestOpen } from '@/lib/global-search'
import type { SearchApp } from '@/lib/global-search'
import { ChatMarkdown } from './chat-markdown'
import { ASSISTANT_NAME } from '@/lib/assistant'

/** A message being sent (shown before the server has saved it). */
export type PendingMessage = { text: string }

// The conversation (shadcn message + bubble, in a message scroller that
// sticks to the latest message) and what each answer created / found, with
// Open buttons.
export function ChatThread({
  messages,
  pending,
}: {
  messages: Array<ChatMessageView>
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
                          <ReferenceText>{pending.text}</ReferenceText>
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
                    <MarkerContent>
                      {ASSISTANT_NAME} is looking it up…
                    </MarkerContent>
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

function ChatBubble({ message }: { message: ChatMessageView }) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent className="whitespace-pre-wrap">
              <ReferenceText>{message.content}</ReferenceText>
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
            {actions.changed.map((change, i) => (
              <ChangedMarker key={i} change={change} />
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
        {message.runId && (
          <UndoButton runId={message.runId} undoable={message.undoable} />
        )}
      </MessageContent>
    </Message>
  )
}

/** Puts back everything the turn changed (once). */
function UndoButton({ runId, undoable }: { runId: string; undoable: boolean }) {
  const undo = useUndoRun()
  if (!undoable) {
    return <p className="text-xs text-muted-foreground">Changes undone.</p>
  }
  return (
    <div>
      <Button
        size="xs"
        variant="outline"
        disabled={undo.isPending}
        onClick={() => undo.mutate(runId)}
      >
        {undo.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Undo2Icon data-icon="inline-start" />
        )}
        Undo changes
      </Button>
    </div>
  )
}

const APP_ITEM: Record<ChangeSummary['app'], string> = {
  bookmarks: 'bookmark',
  notes: 'note',
  tasks: 'task',
  contacts: 'contact',
  calendar: 'calendar strip',
  finances: 'money entry',
  subscriptions: 'recurring',
  budgets: 'budget',
}

function ChangedMarker({ change }: { change: ChangeSummary }) {
  const open = useOpen()
  const navigate = useNavigate()
  const Icon =
    change.op === 'delete'
      ? Trash2Icon
      : change.op === 'create'
        ? change.target === 'folder'
          ? FolderPlusIcon
          : PlusIcon
        : PencilIcon
  const verb =
    change.op === 'delete'
      ? 'Deleted'
      : change.op === 'create'
        ? 'Added'
        : 'Changed'
  const what = change.target === 'folder' ? 'folder' : APP_ITEM[change.app]
  return (
    <Marker>
      <MarkerIcon>
        <Icon />
      </MarkerIcon>
      <MarkerContent>
        {verb} {what} “{change.label}”
        {change.detail ? ` · ${change.detail}` : ''}
        {change.database ? ` · in ${change.database}` : ''}
      </MarkerContent>
      {change.op !== 'delete' && !change.database && (
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            change.app === 'calendar'
              ? void navigate({ to: '/calendar' })
              : change.app === 'finances' ||
                  change.app === 'subscriptions' ||
                  change.app === 'budgets'
                ? void navigate({ to: '/finances' })
                : open({ app: change.app, id: change.id, kind: change.target })
          }
        >
          Open
        </Button>
      )}
    </Marker>
  )
}

function useOpen() {
  const navigate = useNavigate()
  return (target: { app: SearchApp; id: number; kind?: 'folder' | 'item' }) => {
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
        {item.folder ? ` · in ${item.folder}` : ''}
        {item.database ? ` · ${item.database}` : ''}
      </MarkerContent>
      {!item.database && (
        <Button size="xs" variant="outline" onClick={() => open(item)}>
          Open
        </Button>
      )}
    </Marker>
  )
}

function FoundMarker({
  found: { query, match, database },
}: {
  found: AssistantFound
}) {
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
        {database ? ` · in ${database}` : ''}
      </MarkerContent>
      {database && !match.url ? null : match.url ? (
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
  /** `webSearch`: let Jarvis search the web for this message. */
  onSend: (text: string, webSearch: boolean) => Promise<boolean>
  /** `s` focuses it (no dialog open). */
  enabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  // Web search for the next message only (off again once it's sent).
  const [webSearch, setWebSearch] = useState(false)
  const dictation = useDictation({
    onText: setText,
    onError: (message) =>
      toast.add({
        title: "Couldn't listen",
        description: message,
        type: 'error',
      }),
  })

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
    dictation.stop()
    setText('')
    const web = webSearch
    setWebSearch(false)
    // Put it back if it didn't go through.
    if (!(await onSend(message, web))) setText(message)
  }

  return (
    <form
      data-chat-composer
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
          aria-label={`Message ${ASSISTANT_NAME}`}
          placeholder={`Ask ${ASSISTANT_NAME} anything… (@ links to an item)`}
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
              dictation.finish()
              e.currentTarget.blur()
            }
          }}
        />
        <ReferenceAutocomplete target={ref} />
        <InputGroupAddon align="block-end" className="p-2">
          {!text && !dictation.listening && (
            <Kbd className="max-lg:hidden">s</Kbd>
          )}
          <DictateButton
            dictation={dictation}
            value={text}
            disabled={busy}
            size="icon-sm"
          />
          <WebSearchToggle
            on={webSearch}
            onChange={setWebSearch}
            disabled={busy}
          />
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
