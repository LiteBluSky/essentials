import type { ChatInput, ChatStreamEvent } from '@/lib/chat'

// The browser's side of `/api/chat`: sends a message and calls `onEvent`
// with each event as the turn runs. Resolves with the saved conversation's
// id and the apps the turn changed (to refresh); throws the turn's error.

export async function streamChatMessage(
  input: ChatInput,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<{ conversationId: number; apps: Array<string> }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `The server answered ${res.status}`)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (value) buffer += value
    const lines = buffer.split('\n')
    buffer = done ? '' : (lines.pop() ?? '')
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as ChatStreamEvent
      if (event.type === 'error') throw new Error(event.message)
      if (event.type === 'done') return event
      onEvent(event)
    }
    if (done) break
  }
  throw new Error('The answer was cut off')
}
