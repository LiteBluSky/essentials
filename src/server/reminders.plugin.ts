import { definePlugin } from 'nitro'

// Checks for due tasks every minute from server start, so reminders go out
// even when no page is open. It calls the app's /api/reminders route rather
// than the database directly: this plugin is bundled apart from the app, and
// importing the DB here would open (and migrate) a second connection.
// Registered in vite.config.ts (`nitro({ plugins })`).
const EVERY_MS = 60 * 1000

// Always runs: the ntfy topic can be set at any time in Settings (the route
// does nothing until it is).
export default definePlugin((nitroApp) => {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const res = await nitroApp.fetch(
        new Request('http://localhost/api/reminders', { method: 'POST' }),
      )
      if (!res.ok) console.error(`Reminders check failed: ${res.status}`)
    } catch (error) {
      console.error('Reminders check failed:', error)
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), EVERY_MS)
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
