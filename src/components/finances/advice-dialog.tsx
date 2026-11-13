import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { MessagesSquareIcon, SparklesIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { ChatMarkdown } from '@/components/chat/chat-markdown'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { monthLabel } from '@/lib/finances/money'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import { assistantHistoryQueryOptions } from '@/server/assistant.functions'
import { askFinanceAdvice } from '@/server/finances.functions'

/**
 * Advice on demand: one AI request with the month's numbers (and the five
 * before it, the subscriptions and budgets), plus an optional question
 * ("can I afford a 900 € bike?"). The answer is also saved as a chat.
 */
export function AdviceDialog({
  open,
  onOpenChange,
  month,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {open && <Advice month={month} />}
      </DialogContent>
    </Dialog>
  )
}

function Advice({ month }: { month: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const ask = useMutation({
    mutationFn: () => askFinanceAdvice({ data: { question, month } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(assistantHistoryQueryOptions),
        queryClient.invalidateQueries({ queryKey: ['chat'] }),
      ]),
    onError: (error) =>
      toast.add({
        title: "Couldn't get advice",
        description: error.message,
        type: 'error',
      }),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Advice</DialogTitle>
        <DialogDescription>
          {ASSISTANT_NAME} looks at {monthLabel(month)} and the months before
          it.
        </DialogDescription>
      </DialogHeader>
      {ask.data ? (
        <div className="markdown text-sm">
          <ChatMarkdown>{ask.data.answer}</ChatMarkdown>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask.mutate()
          }}
          onKeyDownCapture={submitOnModEnter(() => ask.mutate())}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="advice-question">
                Anything in particular?
              </FieldLabel>
              <Textarea
                id="advice-question"
                ref={ref}
                autoFocus
                rows={3}
                placeholder="Optional: “Can I afford a 900 € bike?”, “How do I start saving?”"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
      )}
      <DialogFooter>
        {ask.data ? (
          <>
            {ask.data.conversationId && (
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: '/chat',
                    search: { c: ask.data.conversationId ?? undefined },
                  })
                }
              >
                <MessagesSquareIcon data-icon="inline-start" />
                Carry on in Chat
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                ask.reset()
                setQuestion('')
              }}
            >
              Ask something else
            </Button>
          </>
        ) : (
          <Button disabled={ask.isPending} onClick={() => ask.mutate()}>
            {ask.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {ask.isPending ? 'Thinking…' : 'Get advice'}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
