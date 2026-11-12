import { and, eq, gt, isNull, lte } from 'drizzle-orm'

import { db } from '@/db'
import { taskFolders, tasks } from '@/db/schema'

// Phone reminders: when an open task falls due, it's pushed once through
// ntfy (https://ntfy.sh, or a self-hosted server) to the topic the phone's
// ntfy app subscribes to, then marked `remindedAt`. Off unless NTFY_TOPIC is
// set. Run every minute by the Nitro plugin (reminders.plugin.ts) through
// the /api/reminders route. Only import from server code.

/** Tasks due longer ago than this are never pushed (e.g. after downtime). */
const MAX_LATE_MS = 24 * 60 * 60 * 1000

export function ntfyConfig() {
  const topic = process.env.NTFY_TOPIC?.trim()
  if (!topic) return null
  return {
    url: `${(process.env.NTFY_URL?.trim() || 'https://ntfy.sh').replace(/\/+$/, '')}/${encodeURIComponent(topic)}`,
    token: process.env.NTFY_TOKEN?.trim() || undefined,
    publicUrl: process.env.PUBLIC_URL?.trim().replace(/\/+$/, '') || undefined,
  }
}

type Push = { title: string; message: string; tags?: string }

/** Sends one notification. Throws if ntfy isn't set up or refuses it. */
export async function push({ title, message, tags = 'alarm_clock' }: Push) {
  const config = ntfyConfig()
  if (!config) throw new Error('Reminders are off: set NTFY_TOPIC')
  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      // Header values must be ASCII-safe; ntfy decodes RFC 2047 words.
      Title: `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`,
      Priority: 'high',
      Tags: tags,
      ...(config.publicUrl && { Click: `${config.publicUrl}/tasks` }),
      ...(config.token && { Authorization: `Bearer ${config.token}` }),
    },
    body: message,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    throw new Error(`ntfy answered ${res.status} ${await res.text()}`.trim())
  }
}

/** Pushes every open task that has fallen due and wasn't pushed yet;
 * returns how many went out. */
export async function sendDueReminders(now = new Date()) {
  if (!ntfyConfig()) return 0
  let sent = 0
  const due = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      folder: taskFolders.name,
    })
    .from(tasks)
    .leftJoin(taskFolders, eq(tasks.folderId, taskFolders.id))
    .where(
      and(
        isNull(tasks.completedAt),
        isNull(tasks.remindedAt),
        lte(tasks.dueAt, now),
        gt(tasks.dueAt, new Date(now.getTime() - MAX_LATE_MS)),
      ),
    )
  for (const task of due) {
    try {
      await push({
        title: task.title,
        message:
          task.description.trim() ||
          (task.folder ? `Due now · ${task.folder}` : 'Due now'),
      })
      await db
        .update(tasks)
        .set({ remindedAt: now })
        .where(eq(tasks.id, task.id))
      sent++
    } catch (error) {
      // Tried again on the next tick.
      console.error(`Reminder for task ${task.id} failed:`, error)
    }
  }
  return sent
}
