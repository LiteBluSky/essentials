import { cn } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  ArrowUpIcon,
  SquareIcon,
  CheckIcon,
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
import {
  AttachButton,
  AttachmentChips,
  AttachmentNames,
  DropHint,
} from '@/components/attachments'
import {
  pastedFiles,
  useAttachments,
  useFileDrop,
} from '@/hooks/use-attachments'
import { parseAttachments } from '@/lib/attachments'
import type { Attachment, AttachmentMeta } from '@/lib/attachments'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useDictation } from '@/hooks/use-dictation'
import type {
  AssistantFound,
  AssistantItem,
  ChangeSummary,
} from '@/lib/assistant'
import { messageActions, toolActivity } from '@/lib/chat'
import type { ChatMessageView, ChatStreamEvent } from '@/lib/chat'
import { useUndoRun } from '@/hooks/use-undo-run'
import { useOpenInProfile } from '@/hooks/use-open-in-profile'
import { requestOpen } from '@/lib/global-search'
import { useMentionTarget } from '@/lib/jarvis-mention'
import type { SearchApp } from '@/lib/global-search'
import { saveAnswerAsNote } from '@/server/chat.functions'
import { ChatMarkdown } from './chat-markdown'
import { ASSISTANT_NAME, isFinancePart } from '@/lib/assistant'
import { isShortcut } from '@/lib/shortcuts'
import { ShortcutKey } from '@/components/shortcut-key'
import { Hint } from '@/components/hint'

/** A message being sent (shown until the server has saved the turn), with
 * the answer so far as it streams in, and the tool it's using meanwhile. */
export type PendingMessage = {
  text: string
  /** The files sent with it. */
  files?: Array<AttachmentMeta>
  answer: string
  tool: string | null
}

/** Applies a streamed event to the pending message. */
export function streamInto(
  pending: PendingMessage | null,
  event: ChatStreamEvent,
): PendingMessage | null {
  if (!pending) return pending
  if (event.type === 'text') {
    return { ...pending, answer: pending.answer + event.delta }
  }
  // The text before tool calls was only a lead-in.
  if (event.type === 'step') return { ...pending, answer: '' }
  if (event.type === 'tool') return { ...pending, tool: event.name }
  return pending
}

// The conversation (shadcn message + bubble, in a message scroller that
// follows the bottom) and what each answer created / found, with Open
// buttons.
export function ChatThread({
  messages,
  pending,
  className,
}: {
  messages: Array<ChatMessageView>
  pending: PendingMessage | null
  /** Extra classes for the content (e.g. the panel's wider padding). */
  className?: string
}) {
  return (
    <MessageScrollerProvider autoScroll>
      <ThreadMessages
        messages={messages}
        pending={pending}
        className={className}
      />
    </MessageScrollerProvider>
  )
}

function ThreadMessages({
  messages,
  pending,
  className,
}: {
  messages: Array<ChatMessageView>
  pending: PendingMessage | null
  className?: string
}) {
  // No scroll anchors (they pin a new question to the top): a message sent,
  // an answer in or another conversation opened goes to the latest message,
  // even when scrolled up.
  const { scrollToEnd } = useMessageScroller()
  const lastId = messages.at(-1)?.id
  const sending = pending !== null
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToEnd())
    return () => cancelAnimationFrame(frame)
  }, [lastId, sending, scrollToEnd])

  return (
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent
          className={cn('mx-auto w-full max-w-3xl px-1 py-4', className)}
        >
          {messages.map((message) => (
            <MessageScrollerItem
              key={message.id}
              messageId={String(message.id)}
            >
              <ChatBubble message={message} />
            </MessageScrollerItem>
          ))}
          {pending && (
            <>
              <MessageScrollerItem messageId="pending">
                <Message align="end">
                  <MessageContent>
                    <AttachmentNames files={pending.files ?? []} />
                    {pending.text && (
                      <Bubble>
                        <BubbleContent className="whitespace-pre-wrap">
                          <ReferenceText>{pending.text}</ReferenceText>
                        </BubbleContent>
                      </Bubble>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
              <MessageScrollerItem>
                {pending.answer ? (
                  <Message>
                    <MessageContent>
                      <Bubble variant="ghost">
                        <BubbleContent aria-live="polite">
                          <ChatMarkdown>{pending.answer}</ChatMarkdown>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                ) : (
                  <Marker role="status">
                    <MarkerIcon>
                      <Spinner />
                    </MarkerIcon>
                    <MarkerContent>{toolActivity(pending.tool)}</MarkerContent>
                  </Marker>
                )}
              </MessageScrollerItem>
            </>
          )}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  )
}

function ChatBubble({ message }: { message: ChatMessageView }) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <AttachmentNames files={parseAttachments(message.attachments)} />
          {message.content && (
            <Bubble>
              <BubbleContent className="whitespace-pre-wrap">
                <ReferenceText>{message.content}</ReferenceText>
              </BubbleContent>
            </Bubble>
          )}
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
        {!message.error && (
          <div className="flex flex-wrap items-center gap-2">
            {message.runId && (
              <UndoButton runId={message.runId} undoable={message.undoable} />
            )}
            <SaveAsNoteButton messageId={message.id} />
          </div>
        )}
      </MessageContent>
    </Message>
  )
}

/** Saves the answer as a note (Notes' Unsorted folder), then offers to
 * open it. */
function SaveAsNoteButton({ messageId }: { messageId: number }) {
  const queryClient = useQueryClient()
  const open = useOpen()
  const [savedId, setSavedId] = useState<number | null>(null)
  const save = useMutation({
    mutationFn: () => saveAnswerAsNote({ data: { id: messageId } }),
    onSuccess: (note) => {
      setSavedId(note.id)
      void queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.add({
        title: 'Saved as a note',
        description: `${note.title || 'Untitled'} · in ${note.folder}`,
        type: 'success',
        actionProps: {
          children: 'Open',
          onClick: () => open({ app: 'notes', id: note.id }),
        },
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save it",
        description: error.message,
        type: 'error',
      }),
  })
  if (savedId !== null) {
    return (
      <Button
        size="xs"
        variant="ghost"
        onClick={() => open({ app: 'notes', id: savedId })}
      >
        <CheckIcon data-icon="inline-start" />
        Saved · Open note
      </Button>
    )
  }
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={save.isPending}
      onClick={() => save.mutate()}
    >
      {save.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <NotebookPenIcon data-icon="inline-start" />
      )}
      Save as note
    </Button>
  )
}

/** Puts back everything the turn changed (once). */
function UndoButton({ runId, undoable }: { runId: string; undoable: boolean }) {
  const undo = useUndoRun()
  if (!undoable) {
    return <p className="text-xs text-muted-foreground">Changes undone.</p>
  }
  return (
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
  savings: 'savings account',
  pending: 'due charge',
  months: 'month',
}

function ChangedMarker({ change }: { change: ChangeSummary }) {
  const open = useOpen()
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
      {change.op !== 'delete' && canOpen(change) && (
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            change.app === 'calendar'
              ? open({ to: '/calendar' }, change)
              : isFinancePart(change.app)
                ? open({ to: '/finances' }, change)
                : open(
                    { app: change.app, id: change.id, kind: change.target },
                    change,
                  )
          }
        >
          Open
        </Button>
      )}
    </Marker>
  )
}

/** Done in the profile in use, or in another one Open can switch to
 * (answers saved before profiles were tracked by id can't). */
function canOpen(where: { database?: string; databaseId?: number | null }) {
  return !where.database || where.databaseId !== undefined
}

/** Opens an item (or a page), in the profile it's in: another one is
 * switched to first. */
function useOpen() {
  const navigate = useNavigate()
  const openInProfile = useOpenInProfile()
  return (
    what:
      | { app: SearchApp; id: number; kind?: 'folder' | 'item' }
      | { to: '/calendar' | '/finances' },
    where: { databaseId?: number | null } = {},
  ) => {
    const to = 'to' in what ? what.to : (`/${what.app}` as const)
    const target =
      'to' in what
        ? undefined
        : { app: what.app, kind: what.kind ?? 'item', id: what.id }
    if (where.databaseId !== undefined) {
      void openInProfile({ profile: where.databaseId, to, target })
      return
    }
    if (target) requestOpen(target)
    void navigate({ to })
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
      {canOpen(item) && (
        <Button size="xs" variant="outline" onClick={() => open(item, item)}>
          Open
        </Button>
      )}
    </Marker>
  )
}

function FoundMarker({
  found: { query, match, database, databaseId },
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
      {!canOpen({ database, databaseId }) && !match.url ? null : match.url ? (
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
        <Button
          size="xs"
          variant="outline"
          onClick={() => open(match, { databaseId })}
        >
          {match.app === 'passwords' ? 'Show password' : 'Open'}
        </Button>
      )}
    </Marker>
  )
}

/**
 * The message box under the conversation: Enter sends, Shift+Enter is a
 * new line, Esc leaves it (so Alt+H / Alt+L and `z` work). `s` (or a
 * tap) comes back. Not focused on its own.
 */
export function ChatComposer({
  busy,
  onSend,
  onCancel,
  enabled,
  mentions = enabled,
  drops = mentions,
}: {
  busy: boolean
  /** `webSearch`: let Jarvis search the web for this message; `files`:
   * what's attached to it (`text` may be empty then). */
  onSend: (
    text: string,
    webSearch: boolean,
    files: Array<Attachment>,
  ) => Promise<boolean>
  /** Stop (the button while busy, or Esc in the box): calls the message
   * off; `onSend` then resolves false and the text comes back. */
  onCancel: () => void
  /** `s` focuses it (no dialog open). */
  enabled: boolean
  /** It takes items mentioned from the global search (default: enabled). */
  mentions?: boolean
  /** Files dropped anywhere on the page come here (default: mentions). */
  drops?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  // Web search for the next message only (off again once it's sent).
  const [webSearch, setWebSearch] = useState(false)
  const attachments = useAttachments()
  const dragging = useFileDrop(drops, (files) => void attachments.add(files))
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
      if (!isShortcut(e, 'global.assistant')) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  // Items mentioned from the global search land here when it's on screen.
  useMentionTarget(ref, mentions)

  const canSend =
    (!!text.trim() || attachments.files.length > 0) && !attachments.reading
  const send = async () => {
    const message = text.trim()
    if (!canSend || busy) return
    dictation.stop()
    setText('')
    const web = webSearch
    setWebSearch(false)
    const files = attachments.take()
    // Put it back if it didn't go through.
    if (!(await onSend(message, web, files))) {
      setText(message)
      attachments.restore(files)
    }
  }

  return (
    <form
      data-chat-composer
      className="relative mx-auto w-full max-w-3xl"
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
          onPaste={(e) => {
            const files = pastedFiles(e)
            if (!files) return
            e.preventDefault()
            void attachments.add(files)
          }}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault()
              void send()
            } else if (e.key === 'Escape') {
              if (busy) {
                // Esc first stops the answer being written.
                e.preventDefault()
                onCancel()
                return
              }
              dictation.finish()
              e.currentTarget.blur()
            }
          }}
        />
        <ReferenceAutocomplete target={ref} />
        <AttachmentChips
          files={attachments.files}
          onRemove={attachments.remove}
          disabled={busy}
        />
        <InputGroupAddon align="block-end" className="p-2">
          {!text && !dictation.listening && (
            <ShortcutKey id="global.assistant" className="max-lg:hidden" />
          )}
          <AttachButton
            onFiles={(files) => void attachments.add(files)}
            disabled={busy}
          />
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
          {busy && <Spinner className="ml-auto text-muted-foreground" />}
          {busy ? (
            <Hint label={'Stop: cancel this message (Esc)'}>
              <InputGroupButton
                variant="default"
                size="icon-sm"
                type="button"
                aria-label="Stop"
                onClick={onCancel}
              >
                <SquareIcon className="fill-current" />
              </InputGroupButton>
            </Hint>
          ) : (
            <Hint label={'Send (Enter)'}>
              <InputGroupButton
                variant="default"
                size="icon-sm"
                type="submit"
                className="ml-auto"
                disabled={!canSend}
                aria-label="Send"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </Hint>
          )}
        </InputGroupAddon>
      </InputGroup>
      <DropHint show={dragging} />
    </form>
  )
}
