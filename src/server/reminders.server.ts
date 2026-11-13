import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { and, eq, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'

import { db, forgetIdle, listProfiles, profileHandle } from '@/db'
import type { Db } from '@/db'
import { calendarEvents, contacts, taskFolders, tasks } from '@/db/schema'
import {
  BIRTHDAY_HOUR,
  ageIn,
  isBirthdayOn,
  parseBirthday,
} from '@/lib/contacts/birthday'
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

type Push = {
  title: string
  message: string
  tags?: string
  /** The app page a tap opens (with the app's public URL set). */
  path?: string
}

/** Sends one notification. Throws if ntfy isn't set up or refuses it. */
export async function push({
  title,
  message,
  tags = 'alarm_clock',
  path = '/tasks',
}: Push) {
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
      ...(config.publicUrl && { Click: `${config.publicUrl}${path}` }),
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

/** Pushes the contacts whose birthday is today, once a year, from
 * `BIRTHDAY_HOUR` (the server's local time: set TZ in Docker) until the
 * day ends; a day missed while the server was off isn't sent late. */
export async function sendBirthdays(
  now = new Date(),
  data: Db = db,
  label?: string,
) {
  if (now.getHours() < BIRTHDAY_HOUR) return 0
  const year = now.getFullYear()
  const candidates = await data
    .select({
      id: contacts.id,
      name: contacts.name,
      birthday: contacts.birthday,
      knownFrom: contacts.knownFrom,
    })
    .from(contacts)
    .where(
      and(
        ne(contacts.birthday, ''),
        or(
          isNull(contacts.birthdayRemindedYear),
          lt(contacts.birthdayRemindedYear, year),
        ),
      ),
    )
  let sent = 0
  for (const contact of candidates) {
    const birthday = parseBirthday(contact.birthday)
    if (!birthday || !isBirthdayOn(birthday, now)) continue
    const age = ageIn(birthday, year)
    try {
      await push({
        title: `${contact.name}'s birthday`,
        message: [
          age !== null ? `Turns ${age} today` : 'Today',
          contact.knownFrom,
          label,
        ]
          .filter(Boolean)
          .join(' · '),
        tags: 'birthday',
        path: '/contacts',
      })
      await data
        .update(contacts)
        .set({ birthdayRemindedYear: year })
        .where(eq(contacts.id, contact.id))
      sent++
    } catch (error) {
      console.error(`Birthday of contact ${contact.id} failed:`, error)
    }
  }
  return sent
}

/** Calendar strips are reminded the day before they start, from this hour
 * (the server's local time: set TZ in Docker). */
export const STRIP_REMIND_HOUR = 9

/** Pushes "tomorrow" for every calendar strip starting tomorrow (server's
 * local day) once it's past `STRIP_REMIND_HOUR`, once per start day
 * (`remindedDay`, so moving a strip re-arms it); a missed day is skipped.
 * Returns how many went out. */
export async function sendStripReminders(
  now = new Date(),
  data: Db = db,
  label?: string,
) {
  if (now.getHours() < STRIP_REMIND_HOUR) return 0
  const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
  const due = await data
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.startDay, tomorrow),
        or(
          isNull(calendarEvents.remindedDay),
          ne(calendarEvents.remindedDay, calendarEvents.startDay),
        ),
      ),
    )
  let sent = 0
  for (const strip of due) {
    const days =
      differenceInCalendarDays(
        parseISO(strip.endDay),
        parseISO(strip.startDay),
      ) + 1
    try {
      await push({
        title: strip.title || 'Calendar',
        message: [
          days > 1
            ? `Tomorrow, until ${format(parseISO(strip.endDay), 'EEE d MMM')} (${days} days)`
            : 'Tomorrow',
          label,
        ]
          .filter(Boolean)
          .join(' · '),
        tags: 'date',
        path: '/calendar',
      })
      await data
        .update(calendarEvents)
        .set({ remindedDay: strip.startDay })
        .where(eq(calendarEvents.id, strip.id))
      sent++
    } catch (error) {
      console.error(`Reminder for strip ${strip.id} failed:`, error)
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
      const data = await profileHandle(profile.id)
      const label = labelled ? profile.name : undefined
      sent += await sendDueReminders(now, data, label)
      sent += await sendBirthdays(now, data, label)
      sent += await sendStripReminders(now, data, label)
    } catch (error) {
      console.error(`Reminders from "${profile.name}" failed:`, error)
    }
  }
  return sent
}
