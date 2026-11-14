import { createFileRoute } from '@tanstack/react-router'

import { chatInput } from '@/lib/chat'
import type { ChatStreamEvent } from '@/lib/chat'

// Sends a chat message (Chat and the Jarvis panel) and streams the turn
// back as it runs: one JSON `ChatStreamEvent` per line, ending with `done`
// (or `error`). A route rather than a server function so the answer can be
// shown as it's written. The turn is saved either way, even if the browser
// goes away part-way. No auth by design (see CLAUDE.md).
export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = chatInput.safeParse(
          await request.json().catch(() => null),
        )
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Bad request' },
            { status: 400 },
          )
        }
        const { sendMessage } = await import('@/server/chat.server')
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let open = true
            const send = (event: ChatStreamEvent) => {
              if (!open) return
              try {
                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
              } catch {
                open = false // The browser went away; the turn carries on.
              }
            }
            try {
              const turn = await sendMessage(parsed.data, send)
              const { created, changed } = turn.result
              send({
                type: 'done',
                conversationId: turn.conversationId,
                apps: [...new Set([...created, ...changed].map((i) => i.app))],
              })
            } catch (error) {
              send({
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
              })
            }
            try {
              controller.close()
            } catch {
              // Already gone.
            }
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
            // Proxies (nginx…) would otherwise hold it back until the end.
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
