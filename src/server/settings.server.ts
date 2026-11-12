import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { settings } from '@/db/schema'
import { SETTINGS, SETTING_KEYS } from '@/lib/settings'
import type { SettingKey, SettingsInput, SettingsView } from '@/lib/settings'

// Server-only. Saved settings win over the env var of the same name.

/** Every setting's effective value ('' = unset). */
export async function readSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.select().from(settings)
  const saved = new Map(rows.map((row) => [row.key, row.value]))
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [
      key,
      (saved.get(key) ?? process.env[key] ?? '').trim(),
    ]),
  ) as Record<SettingKey, string>
}

/** The settings as the browser may see them: secrets masked. */
export async function viewSettings(): Promise<SettingsView> {
  const rows = await db.select().from(settings)
  const saved = new Map(rows.map((row) => [row.key, row.value]))
  return Object.fromEntries(
    SETTING_KEYS.map((key) => {
      const fromDb = saved.get(key)
      const fromEnv = process.env[key]?.trim()
      const value = fromDb ?? fromEnv ?? ''
      const source = fromDb ? 'saved' : fromEnv ? 'env' : null
      return [
        key,
        SETTINGS[key].secret
          ? { value: '', source, ...(value && { hint: value.slice(-4) }) }
          : { value, source },
      ]
    }),
  ) as SettingsView
}

export async function saveSettings(input: SettingsInput) {
  await db.transaction(async (tx) => {
    for (const key of SETTING_KEYS) {
      const value = input[key]
      if (value === undefined) continue
      if (value === '') {
        await tx.delete(settings).where(eq(settings.key, key))
      } else {
        await tx
          .insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value, updatedAt: new Date() },
          })
      }
    }
  })
}
