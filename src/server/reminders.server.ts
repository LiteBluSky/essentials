import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { taskFolders, tasks } from '@/db/schema'
import { leadLabel } from '@/lib/tasks/tree'
import { readSettings } from './settings.server'

// Phone reminders: when an open task falls due, it's pushed once through
// ntfy (https://ntfy.sh, or a self-hosted server) to the topic the phone's
// ntfy app subscribes to, `remindMinutes` before it's due (0 = at the due
// time, null = never), then marked `remindedAt`. Off unless NTFY_TOPIC is
// set (Settings…, or the env). Run every minute by the Nitro plugin (reminders.plugin.ts) through
// the /api/reminders route. Only import from server code.

/** Reminders more than this late are never pushed (e.g. after downtime). */
const MAX_LATE_MS = 24 * 60 * 60 * 1000

/** When a task's reminder is due, in seconds (as stored). */
const remindAt = sql`${tasks.dueAt} - ${tasks.remindMinutes} * 60`

/** "Due in 15 min", "Due in 1 day", "Due now". */
function dueIn(dueAt: Date | null, now: Date) {
  const minutes = dueAt
    ? Math.ceil((dueAt.getTime() - now.getTime()) / 60_000)
    : 0
  return minutes > 0 ? `Due in ${leadLabel(minutes)}` : 'Due now'
}

async function ntfyConfig() {
  const settings = await readSettings()
  if (!settings.NTFY_TOPIC) return null
  const server = (settings.NTFY_URL || 'https://ntfy.sh').replace(/\/+$/, '')
  return {
    url: `${server}/${encodeURIComponent(settings.NTFY_TOPIC)}`,
    token: settings.NTFY_TOKEN || undefined,
    publicUrl: settings.PUBLIC_URL.replace(/\/+$/, '') || undefined,
  }
}

type Push = { title: string; message: string; tags?: string }

/** Sends one notification. Throws if ntfy isn't set up or refuses it. */
export async function push({ title, message, tags = 'alarm_clock' }: Push) {
  const config = await ntfyConfig()
  if (!config) {
    throw new Error('Reminders are off: add an ntfy topic in Settings')
  }
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

/** Pushes every open task whose reminder time (dueAt − remindMinutes) has
 * come and that wasn't pushed yet; returns how many went out. */
export async function sendDueReminders(now = new Date()) {
  if (!(await ntfyConfig())) return 0
  let sent = 0
  const due = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      dueAt: tasks.dueAt,
      folder: taskFolders.name,
    })
    .from(tasks)
    .leftJoin(taskFolders, eq(tasks.folderId, taskFolders.id))
    .where(
      and(
        isNull(tasks.completedAt),
        isNull(tasks.remindedAt),
        isNotNull(tasks.dueAt),
        isNotNull(tasks.remindMinutes),
        // Timestamps are stored in seconds.
        sql`${remindAt} <= ${Math.floor(now.getTime() / 1000)}`,
        sql`${remindAt} > ${Math.floor((now.getTime() - MAX_LATE_MS) / 1000)}`,
      ),
    )
  for (const task of due) {
    try {
      await push({
        title: task.title,
        message: [
          [dueIn(task.dueAt, now), task.folder].filter(Boolean).join(' · '),
          task.description.trim(),
        ]
          .filter(Boolean)
          .join('\n'),
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
