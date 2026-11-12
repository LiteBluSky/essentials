import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { SendHorizontalIcon, SparklesIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { DictateButton } from '@/components/dictate-button'
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
  if (!available) return null
  return <AssistantField enabled={enabled} />
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
    onSuccess: async ({ created, found, changed, runId, answer }) => {
      setText('')
      history.reset()
      await Promise.all(
        [...new Set([...created, ...changed].map((item) => item.app))].map(
          // Every query of the app (the Calendar's isn't a tree).
          (app) => queryClient.invalidateQueries({ queryKey: [app] }),
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
        })
      }
      // The first thing found opens straight away; any others are offered.
      found.forEach((entry, i) => showFound(entry, i === 0))
      for (const item of created) {
        toast.add({
          title: itemTitle(item),
          description: itemDetail(item),
          type: 'success',
          actionProps: {
            children: 'Open',
            onClick: () => {
              requestOpen({ app: item.app, kind: 'item', id: item.id })
              void navigate({ to: `/${item.app}` })
            },
          },
        })
      }
    },
    // Every request (failed ones too) is in the history.
    onSettled: () =>
      queryClient.invalidateQueries(assistantHistoryQueryOptions),
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

  const showFound = ({ query, match }: AssistantFound, openNow: boolean) => {
    if (!match) {
      toast.add({
        title: `Couldn't find “${query}”`,
        description: 'Try other words, or search everything with z.',
        type: 'warning',
      })
      return
    }
    const where = [APP_LABEL[match.app], match.path].filter(Boolean).join(' › ')
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <SparklesIcon />
        </InputGroupAddon>
        <InputGroupTextarea
          ref={ref}
          rows={1}
          className="min-h-0"
          aria-label={`Ask ${ASSISTANT_NAME}: a task, a reminder, a note or a question`}
          placeholder={`Ask ${ASSISTANT_NAME}…`}
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
        <InputGroupAddon align="inline-end">
          {!text && !ask.isPending && !dictation.listening && (
            <Kbd className="max-sm:hidden">s</Kbd>
          )}
          <DictateButton
            dictation={dictation}
            value={text}
            disabled={ask.isPending}
          />
          <InputGroupButton
            type="submit"
            size="icon-xs"
            aria-label="Send"
            title="Send (Enter)"
            disabled={!text.trim() || ask.isPending}
          >
            {ask.isPending ? <Spinner /> : <SendHorizontalIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

/** "Deleted note “X”", "Changed task “Y” · renamed", at most 5 lines. */
function changeLines(changed: Array<ChangeSummary>) {
  const lines = changed.map(
    (c) =>
      `${c.op === 'delete' ? 'Deleted' : c.op === 'create' ? 'Added' : 'Changed'} ${c.target === 'folder' ? 'folder' : c.app === 'calendar' ? 'calendar strip' : APP_LABEL[c.app].toLowerCase().replace(/s$/, '')} “${c.label}”${c.detail ? ` · ${c.detail}` : ''}`,
  )
  return lines.length > 5
    ? [...lines.slice(0, 5), `…and ${lines.length - 5} more`].join('\n')
    : lines.join('\n')
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
  const where = `${item.app === 'tasks' ? 'Tasks' : 'Notes'} › ${item.folder ?? UNSORTED_FOLDER}`
  return item.app === 'tasks' && item.dueAt
    ? `Due ${format(item.dueAt, 'EEE d MMM HH:mm')} · ${where}`
    : where
}
