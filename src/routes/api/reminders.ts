import { createFileRoute } from '@tanstack/react-router'

// Sends the reminders that have fallen due (see reminders.server.ts). Called
// every minute by the Nitro plugin (reminders.plugin.ts) through the app's
// own fetch, so it runs on the app's one database connection. Harmless if
// called by anyone else: it only sends what's due, once.
export const Route = createFileRoute('/api/reminders')({
  server: {
    handlers: {
      POST: async () => {
        const { sendDueReminders } = await import('@/server/reminders.server')
        return Response.json({ sent: await sendDueReminders() })
      },
    },
  },
})
