import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowUpIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  AssistantSidebar,
  useDesktopAssistant,
} from '@/components/assistant-sidebar'
import { DictateButton } from '@/components/dictate-button'
import { MobileDock } from '@/components/mobile-dock'
import { ReferenceText } from '@/components/reference'
import { ReferenceAutocomplete } from '@/components/reference-autocomplete'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { ASSISTANT_NAME, UNSORTED_FOLDER } from '@/lib/assistant'
import type {
  AssistantFound,
  AssistantItem,
  ChangeSummary,
} from '@/lib/assistant'
import { requestOpen } from '@/lib/global-search'
import { useDictation } from '@/hooks/use-dictation'
import { useRequestHistory } from '@/hooks/use-request-history'
import { useUndoRun } from '@/hooks/use-undo-run'
import {
  askAssistant,
  assistantEnabledQueryOptions,
  assistantHistoryQueryOptions,
} from '@/server/assistant.functions'

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * The "Tell me…" field at the top of every app: type (or dictate: the mic
 * button, or the phone keyboard's) a task, reminder or note, Enter, and the assistant
 * files it in a fitting folder (else "Unsorted") in Tasks / Notes. Only shown when the server has
 * an LLM key. Not focused on its own: `s` (while `enabled`: no dialog
 * open) or a tap goes in, Esc hands the keys back to the tree.
 */
export function AssistantBox({ enabled }: { enabled: boolean }) {
  const { data: available } = useSuspenseQuery(assistantEnabledQueryOptions)
  const desktop = useDesktopAssistant()
  if (!available) return null
  // From `xl` up Jarvis is the chat panel on the right; below, this field
  // (floating at the bottom on phones). Both render (no flash on load);
  // CSS shows one, and only that one takes `s`.
  return (
    <>
      <div className="xl:hidden">
        <AssistantField enabled={enabled && !desktop} />
      </div>
      <AssistantSidebar enabled={enabled} />
    </>
  )
}

function AssistantField({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const history = useRequestHistory()
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
      if (e.key !== 's' || isTyping(e.target)) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  const undo = useUndoRun()
  const ask = useMutation({
    mutationFn: (sentence: string) =>
      askAssistant({
        data: {
          text: sentence,
          now: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    onSuccess: async ({
      created,
      found,
      changed,
      runId,
      answer,
      conversationId,
    }) => {
      setText('')
      history.reset()
      await Promise.all(
        [...new Set([...created, ...changed].map((item) => item.app))].map(
          // Every query of the app (the Calendar's isn't a tree).
          (app) =>
            queryClient.invalidateQueries({
              queryKey: [app === 'subscriptions' ? 'finances' : app],
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
          // Made in another profile: its id means nothing here.
          ...(!item.database && {
            actionProps: {
              children: 'Open',
              onClick: () => {
                requestOpen({ app: item.app, kind: 'item', id: item.id })
                void navigate({ to: `/${item.app}` })
              },
            },
          }),
        })
      }
    },
    // Every request (failed ones too) is in the history, and saved as a chat.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(assistantHistoryQueryOptions),
        queryClient.invalidateQueries({ queryKey: ['chat'] }),
      ]),
    onError: (error) =>
      toast.add({
        title: "Couldn't do that",
        description: error.message,
        type: 'error',
      }),
  })

  const openMatch = (match: NonNullable<AssistantFound['match']>) => {
    requestOpen({ app: match.app, kind: match.kind, id: match.id })
    void navigate({ to: `/${match.app}` })
  }

  const showFound = (
    { query, match, database }: AssistantFound,
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
      // In another profile: say where, nothing to open here.
      toast.add({ title: match.label, description: where })
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

  const send = () => {
    const sentence = text.trim()
    if (!sentence || ask.isPending) return
    dictation.stop()
    ask.mutate(sentence)
  }

  // Laid out exactly like Chat's box (ChatComposer): the field, then a row
  // with the mic and the send button. On phones it floats at the bottom
  // (MobileDock), as Chat's does.
  return (
    <MobileDock>
      <form
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
          {/* The same bottom row as Chat's box. */}
          <InputGroupAddon align="block-end" className="p-2">
            {!text && !ask.isPending && !dictation.listening && (
              <Kbd className="max-sm:hidden">s</Kbd>
            )}
            <DictateButton
              dictation={dictation}
              value={text}
              disabled={ask.isPending}
              size="icon-sm"
            />
            <InputGroupButton
              variant="default"
              size="icon-sm"
              type="submit"
              className="ml-auto"
              disabled={!text.trim() || ask.isPending}
              aria-label="Send"
              title="Send (Enter)"
            >
              {ask.isPending ? <Spinner /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
  subscriptions: 'subscription',
}

const APP_LABEL = {
  bookmarks: 'Bookmarks',
  notes: 'Notes',
  tasks: 'Tasks',
  contacts: 'Contacts',
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
