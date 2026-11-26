import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  AssistantSidebar,
  useDesktopAssistant,
} from '@/components/assistant-sidebar'
import { overlayOpen } from '@/components/app-switcher'
import {
  AttachButton,
  AttachmentChips,
  DropHint,
} from '@/components/attachments'
import { DictateButton } from '@/components/dictate-button'
import { WebSearchToggle } from '@/components/web-search-toggle'
import { MobileDock } from '@/components/mobile-dock'
import { ReferenceText } from '@/components/reference'
import { ReferenceAutocomplete } from '@/components/reference-autocomplete'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ASSISTANT_NAME, UNSORTED_FOLDER } from '@/lib/assistant'
import { refreshKey } from '@/lib/chat'
import type {
  AssistantFound,
  AssistantItem,
  ChangeSummary,
} from '@/lib/assistant'
import { requestOpen } from '@/lib/global-search'
import type { SearchTarget } from '@/lib/global-search'
import { useMentionTarget } from '@/lib/jarvis-mention'
import { useCancelRequest } from '@/hooks/use-cancel-request'
import { useDictation } from '@/hooks/use-dictation'
import {
  pastedFiles,
  useAttachments,
  useFileDrop,
} from '@/hooks/use-attachments'
import type { Attachment } from '@/lib/attachments'
import { useOpenInProfile } from '@/hooks/use-open-in-profile'
import { useRequestHistory } from '@/hooks/use-request-history'
import { useUndoRun } from '@/hooks/use-undo-run'
import {
  askAssistant,
  assistantEnabledQueryOptions,
  assistantHistoryQueryOptions,
} from '@/server/assistant.functions'
import { isShortcut } from '@/lib/shortcuts'
import { ShortcutKey } from '@/components/shortcut-key'

/**
 * The "Tell me…" field at the top of every app: type (or dictate: the mic
 * button, or the phone keyboard's) a task, reminder or note, Enter, and the assistant
 * files it in a fitting folder (else "Unsorted") in Tasks / Notes. Only shown when the server has
 * an LLM key. Not focused on its own: `s` (while `enabled`: no dialog
 * open) or a tap goes in, Esc hands the keys back to the tree.
 */
export function AssistantBox({
  enabled,
  phonesOnly = false,
}: {
  enabled: boolean
  /** Only the floating field on phones (below `lg`) and the panel from
   * `xl`: nothing in between (Calendar and Finances keep their room). */
  phonesOnly?: boolean
}) {
  const { data: available } = useSuspenseQuery(assistantEnabledQueryOptions)
  const desktop = useDesktopAssistant()
  if (!available) return null
  // From `xl` up Jarvis is the chat panel on the right; below, this field
  // (floating at the bottom on phones). Both render (no flash on load);
  // CSS shows one, and only that one takes `s`.
  return (
    <>
      <div className={phonesOnly ? 'lg:hidden' : 'xl:hidden'}>
        <AssistantField enabled={enabled && !desktop} />
      </div>
      <AssistantSidebar enabled={enabled} />
    </>
  )
}

function AssistantField({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openInProfile = useOpenInProfile()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  // Web search for the next request only (off again once it's sent).
  const [webSearch, setWebSearch] = useState(false)
  const history = useRequestHistory()
  // Files for the next request; kept until it went through (like the text).
  const attachments = useAttachments()
  const dragging = useFileDrop(enabled, (files) => void attachments.add(files))
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
  useMentionTarget(ref, enabled)

  const undo = useUndoRun()
  // Stopped (here, by Esc or from the Jarvis indicator): the request is
  // called off (what it had already changed is put back) and the sentence
  // stays in the field, to fix and send again. The indicator says so.
  const request = useCancelRequest(() => {
    ask.reset()
    requestAnimationFrame(() => ref.current?.focus())
  })
  const ask = useMutation({
    mutationFn: ({
      sentence,
      web,
      files,
      requestId,
    }: {
      sentence: string
      web: boolean
      files: Array<Attachment>
      requestId: string
    }) =>
      askAssistant({
        data: {
          text: sentence,
          attachments: files,
          now: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          webSearch: web,
          requestId,
        },
      }),
    onSuccess: async (
      { created, found, changed, runId, answer, conversationId },
      { web },
    ) => {
      setText('')
      attachments.take()
      history.reset()
      await Promise.all(
        [...new Set([...created, ...changed].map((item) => item.app))].map(
          // Every query of the app (the Calendar's isn't a tree).
          (app) =>
            queryClient.invalidateQueries({
              queryKey: [refreshKey(app)],
            }),
        ),
      )
      // Edits / deletions: one toast saying what changed, with Undo.
      if (changed.length) {
        toast.add({
          title: answer ? (
            <ReferenceText>{answer}</ReferenceText>
          ) : (
            `${changed.length} change${changed.length === 1 ? '' : 's'} made`
          ),
          description: changeLines(changed),
          type: 'success',
          timeout: 10_000,
          ...(runId && {
            actionProps: {
              children: 'Undo',
              onClick: () => undo.mutate(runId),
            },
          }),
        })
      } else if (!created.length && !found.length && answer) {
        // A web answer (long, with its sources as links) doesn't fit a
        // toast: it opens in Chat, where it was saved.
        if (web && conversationId) {
          void navigate({ to: '/chat', search: { c: conversationId } })
          return
        }
        // A question answered: just say it.
        toast.add({
          title: <ReferenceText>{answer.slice(0, 300)}</ReferenceText>,
          timeout: 10_000,
          ...(conversationId && {
            actionProps: {
              children: 'Open in Chat',
              onClick: () =>
                void navigate({ to: '/chat', search: { c: conversationId } }),
            },
          }),
        })
      }
      // The first thing found opens straight away; any others are offered.
      found.forEach((entry, i) => showFound(entry, i === 0))
      for (const item of created) {
        toast.add({
          title: itemTitle(item),
          description: itemDetail(item),
          type: 'success',
          // Made in another profile: Open switches to it first (not for
          // results saved before profiles were tracked by id).
          ...((!item.database || item.databaseId !== undefined) && {
            actionProps: {
              children: 'Open',
              onClick: () =>
                openTarget(
                  { app: item.app, kind: 'item', id: item.id },
                  item.databaseId,
                ),
            },
          }),
        })
      }
    },
    // Every request (failed ones too) is in the history, and saved as a chat.
    onSettled: (data, error, { requestId }) => {
      request.finish(requestId, {
        conversationId: data?.conversationId ?? null,
        error: error?.message,
      })
      return Promise.all([
        queryClient.invalidateQueries(assistantHistoryQueryOptions),
        queryClient.invalidateQueries({ queryKey: ['chat'] }),
      ])
    },
    onError: (error, { requestId }) => {
      // Stopped by the user: already said so.
      if (request.wasCancelled(requestId)) return
      toast.add({
        title: "Couldn't do that",
        description: error.message,
        type: 'error',
      })
    },
  })

  const cancel = () => {
    if (ask.isPending) request.cancel()
  }
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  // Esc stops it too (the field is disabled meanwhile, so it can't hear it).
  // On `document`, so it comes before the Esc that dismisses toasts
  // (`ToastEscape`, on `window`): a toast on screen doesn't keep Esc from
  // stopping the request.
  const pending = ask.isPending
  useEffect(() => {
    if (!pending) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || overlayOpen()) return
      e.preventDefault()
      cancelRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pending])

  /** Opens it here, or in the profile it's in (switched to first). */
  const openTarget = (target: SearchTarget, profile?: number | null) => {
    if (profile !== undefined) {
      void openInProfile({ profile, to: `/${target.app}`, target })
      return
    }
    requestOpen(target)
    void navigate({ to: `/${target.app}` })
  }

  const openMatch = (
    match: NonNullable<AssistantFound['match']>,
    profile?: number | null,
  ) => openTarget({ app: match.app, kind: match.kind, id: match.id }, profile)

  const showFound = (
    { query, match, database, databaseId }: AssistantFound,
    openNow: boolean,
  ) => {
    if (!match) {
      toast.add({
        title: `Couldn't find “${query}”`,
        description: 'Try other words, or search everything with z.',
        type: 'warning',
      })
      return
    }
    const where = [
      database && `In ${database}`,
      APP_LABEL[match.app],
      match.path,
    ]
      .filter(Boolean)
      .join(' › ')
    if (database && !match.url) {
      // In another profile: offered (opening it switches profile), never
      // opened on its own.
      toast.add({
        title: match.label,
        description: where,
        ...(databaseId !== undefined && {
          actionProps: {
            children: `Open in ${database}`,
            onClick: () => openMatch(match, databaseId),
          },
        }),
      })
      return
    }
    if (match.url) {
      // A link opens in a new tab, unless the browser blocks a tab opened
      // this long after the click: then it's a button in the toast. (Not
      // 'noopener': window.open would then always return null.)
      const url = match.url
      const tab = openNow ? window.open(url, '_blank') : null
      if (tab) {
        tab.opener = null
        return
      }
      toast.add({
        title: match.label,
        description: url,
        actionProps: {
          children: 'Open link',
          onClick: () => window.open(url, '_blank', 'noopener'),
        },
      })
      return
    }
    if (openNow) {
      openMatch(match)
      return
    }
    toast.add({
      title: match.label,
      description: where,
      actionProps: { children: 'Open', onClick: () => openMatch(match) },
    })
  }

  const canSend =
    (!!text.trim() || attachments.files.length > 0) && !attachments.reading
  const send = () => {
    const sentence = text.trim()
    if (!canSend || ask.isPending) return
    dictation.stop()
    ask.mutate({
      sentence,
      web: webSearch,
      files: attachments.files,
      requestId: request.start({ web: webSearch }).requestId,
    })
    setWebSearch(false)
  }

  // Laid out exactly like Chat's box (ChatComposer): the field, then a row
  // with the mic and the send button. On phones it floats at the bottom
  // (MobileDock), as Chat's does.
  return (
    <MobileDock>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            ref={ref}
            rows={1}
            className="max-h-48 min-h-10 overflow-y-auto"
            aria-label={`Ask ${ASSISTANT_NAME}: a task, a reminder, a note or a question`}
            placeholder={`Ask ${ASSISTANT_NAME} anything… (@ links to an item)`}
            enterKeyHint="send"
            value={text}
            disabled={ask.isPending}
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
                send()
              } else if (e.key === 'Escape') {
                dictation.finish()
                e.currentTarget.blur()
              } else if (
                (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
                !e.shiftKey &&
                !e.altKey &&
                !e.ctrlKey &&
                !e.metaKey
              ) {
                // Like a terminal: ↑ on the first line brings back older
                // requests, ↓ on the last line newer ones, then the draft.
                const el = e.currentTarget
                const older = e.key === 'ArrowUp'
                const edge = older
                  ? !el.value.slice(0, el.selectionStart).includes('\n')
                  : !el.value.slice(el.selectionEnd).includes('\n')
                if (!edge || (!older && !history.browsing())) return
                e.preventDefault()
                void history.recall(older ? 1 : -1, text).then((next) => {
                  if (next === null) return
                  setText(next)
                  requestAnimationFrame(() =>
                    el.setSelectionRange(next.length, next.length),
                  )
                })
              }
            }}
          />
          <ReferenceAutocomplete target={ref} />
          <AttachmentChips
            files={attachments.files}
            onRemove={attachments.remove}
            disabled={ask.isPending}
          />
          {/* The same bottom row as Chat's box. */}
          <InputGroupAddon align="block-end" className="p-2">
            {!text && !ask.isPending && !dictation.listening && (
              <ShortcutKey id="global.assistant" className="max-lg:hidden" />
            )}
            <AttachButton
              onFiles={(files) => void attachments.add(files)}
              disabled={ask.isPending}
            />
            <DictateButton
              dictation={dictation}
              value={text}
              disabled={ask.isPending}
              size="icon-sm"
            />
            <WebSearchToggle
              on={webSearch}
              onChange={setWebSearch}
              disabled={ask.isPending}
            />
            {ask.isPending && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner />
                {ask.variables.web ? 'Searching the web…' : 'Thinking…'}
              </span>
            )}
            {ask.isPending ? (
              <InputGroupButton
                variant="default"
                size="icon-sm"
                type="button"
                aria-label="Stop"
                title="Stop: cancel this request (Esc)"
                onClick={cancel}
              >
                <SquareIcon className="fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                variant="default"
                size="icon-sm"
                type="submit"
                className="ml-auto"
                disabled={!canSend}
                aria-label="Send"
                title="Send (Enter)"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
        <DropHint show={dragging} />
      </form>
    </MobileDock>
  )
}

/** "Deleted note “X”", "Changed task “Y” · renamed", at most 5 lines. */
function changeLines(changed: Array<ChangeSummary>) {
  const lines = changed.map(
    (c) =>
      `${c.op === 'delete' ? 'Deleted' : c.op === 'create' ? 'Added' : 'Changed'} ${c.target === 'folder' ? 'folder' : CHANGE_ITEM[c.app]} “${c.label}”${c.detail ? ` · ${c.detail}` : ''}${c.database ? ` · in ${c.database}` : ''}`,
  )
  return lines.length > 5
    ? [...lines.slice(0, 5), `…and ${lines.length - 5} more`].join('\n')
    : lines.join('\n')
}

const CHANGE_ITEM: Record<ChangeSummary['app'], string> = {
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

const APP_LABEL = {
  bookmarks: 'Bookmarks',
  notes: 'Notes',
  tasks: 'Tasks',
  contacts: 'Contacts',
  passwords: 'Passwords',
}

function itemTitle(item: AssistantItem) {
  const title =
    item.title.length > 60 ? `${item.title.slice(0, 60)}…` : item.title
  return `${item.app === 'tasks' ? 'Task' : 'Note'}: ${title}`
}

function itemDetail(item: AssistantItem) {
  const where = `${item.database ? `${item.database} › ` : ''}${item.app === 'tasks' ? 'Tasks' : 'Notes'} › ${item.folder ?? UNSORTED_FOLDER}`
  return item.app === 'tasks' && item.dueAt
    ? `Due ${format(item.dueAt, 'EEE d MMM HH:mm')} · ${where}`
    : where
}
