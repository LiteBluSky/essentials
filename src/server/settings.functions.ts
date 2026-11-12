import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { settingsInput } from '@/lib/settings'
import { push } from './reminders.server'
import { saveSettings, viewSettings } from './settings.server'

// Settings… (every app's ⋮ menu). No auth by design (see CLAUDE.md): anyone
// on the LAN can change them, but secrets are never sent back out.

export const getSettings = createServerFn({ method: 'GET' }).handler(() =>
  viewSettings(),
)

export const settingsQueryOptions = queryOptions({
  queryKey: ['settings'],
  queryFn: () => getSettings(),
})

export const updateSettings = createServerFn({ method: 'POST' })
  .validator(settingsInput)
  .handler(async ({ data }) => {
    await saveSettings(data)
  })

/** "Send test reminder": pushes a test notification via ntfy. */
export const testReminder = createServerFn({ method: 'POST' }).handler(
  async () => {
    await push({
      title: 'Test reminder',
      message: 'Reminders from your tasks will arrive like this.',
      tags: 'white_check_mark',
    })
  },
)
