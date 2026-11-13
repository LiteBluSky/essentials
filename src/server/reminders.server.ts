import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'

import { db, forgetIdle, listProfiles, profileHandle } from '@/db'
import type { Db } from '@/db'
import { taskFolders, tasks } from '@/db/schema'
import { leadLabel } from '@/lib/tasks/tree'
import { readSettings } from './settings.server'

// Phone reminders: an open task is pushed through ntfy (https://ntfy.sh, or
// a self-hosted server) to the topic the phone's ntfy app subscribes to,
// `remindMinutes` before it's due (0 = at the due time, null = never), again
// when it falls due, then every `NAG_MINUTES` while it's overdue and still
// open (dismissing the notification isn't doing it); `remindedAt` is the
// last push. Every database is checked (the local file and each one in
// Settings → Database), not just the one in use. Off unless NTFY_TOPIC is
// set (Settings…, or the env). Run every minute by the Nitro plugin (reminders.plugin.ts) through
// the /api/reminders route. Only import from server code.

/** An overdue open task is pushed again this often until it's done. */
export const NAG_MINUTES = 10

/** Early reminders more than this late are never pushed (e.g. after
 * downtime); once due, the overdue ones take over. */
const MAX_LATE_MS = 24 * 60 * 60 * 1000

/** When a task's reminder is due, in seconds (as stored). */
const remindAt = sql`${tasks.dueAt} - ${tasks.remindMinutes} * 60`

/** "Due in 15 min", "Due now", "Overdue by 40 min" / "3 hours" / "2 days". */
function dueIn(dueAt: Date | null, now: Date) {
  const minutes = dueAt ? (dueAt.getTime() - now.getTime()) / 60_000 : 0
  if (minutes > 0) return `Due in ${leadLabel(Math.ceil(minutes))}`
  const late = Math.floor(-minutes)
  if (late < 1) return 'Due now'
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? '' : 's'}`
  if (late < 60) return `Overdue by ${late} min`
  if (late < 24 * 60)
    return `Overdue by ${plural(Math.floor(late / 60), 'hour')}`
  return `Overdue by ${plural(Math.floor(late / (24 * 60)), 'day')}`
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

/** Pushes every open task whose early reminder (dueAt − remindMinutes) has
 * come and wasn't pushed yet, that just fell due, or that's overdue and
 * wasn't pushed for `NAG_MINUTES`; returns how many went out. */
export async function sendDueReminders(
  now = new Date(),
  data: Db = db,
  label?: string,
) {
  if (!(await ntfyConfig())) return 0
  let sent = 0
  // Timestamps are stored in seconds.
  const nowS = Math.floor(now.getTime() / 1000)
  const due = await data
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
        isNotNull(tasks.dueAt),
        isNotNull(tasks.remindMinutes),
        or(
          // The early reminder, before it's due.
          and(
            isNull(tasks.remindedAt),
            sql`${tasks.dueAt} > ${nowS}`,
            sql`${remindAt} <= ${nowS}`,
            sql`${remindAt} > ${nowS - MAX_LATE_MS / 1000}`,
          ),
          // Due: once at the due time, then every NAG_MINUTES until done.
          and(
            sql`${tasks.dueAt} <= ${nowS}`,
            or(
              isNull(tasks.remindedAt),
              lt(tasks.remindedAt, tasks.dueAt),
              sql`${tasks.remindedAt} <= ${nowS - NAG_MINUTES * 60}`,
            ),
          ),
        ),
      ),
    )
  for (const task of due) {
    try {
      await push({
        title: task.title,
        message: [
          [dueIn(task.dueAt, now), task.folder, label]
            .filter(Boolean)
            .join(' · '),
          task.description.trim(),
        ]
          .filter(Boolean)
          .join('\n'),
      })
      await data
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

/** `sendDueReminders` on every profile: the local file and each remote
 * database in Settings → Database, in use or not. One that can't be
 * reached is skipped (and tried again next tick). With several, each
 * reminder names the database it's from. */
export async function sendAllReminders(now = new Date()) {
  if (!(await ntfyConfig())) return 0
  const profiles = await listProfiles()
  forgetIdle(profiles.flatMap((p) => (p.id === null ? [] : [p.id])))
  const labelled = profiles.length > 1
  let sent = 0
  for (const profile of profiles) {
    try {
      sent += await sendDueReminders(
        now,
        await profileHandle(profile.id),
        labelled ? profile.name : undefined,
      )
    } catch (error) {
      console.error(`Reminders from "${profile.name}" failed:`, error)
    }
  }
  return sent
}
