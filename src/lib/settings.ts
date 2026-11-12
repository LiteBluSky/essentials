import { z } from 'zod'

// Settings edited in the UI (Settings… in each app's ⋮ menu) and stored in
// the `settings` table. Each falls back to the env var of the same name when
// it isn't saved. Secret ones are never sent back to the browser: it only
// learns whether one is set (and its last 4 characters).

export const SETTINGS = {
  LLM_API_KEY: {
    label: 'API key',
    secret: true,
    placeholder: 'sk-or-…',
  },
  LLM_BASE_URL: {
    label: 'API base URL',
    secret: false,
    placeholder: 'https://openrouter.ai/api/v1',
  },
  LLM_MODEL: {
    label: 'Model',
    secret: false,
    placeholder: 'anthropic/claude-haiku-5.5',
  },
  NTFY_TOPIC: {
    label: 'ntfy topic',
    secret: false,
    placeholder: 'a long random name',
  },
  NTFY_URL: {
    label: 'ntfy server',
    secret: false,
    placeholder: 'https://ntfy.sh',
  },
  NTFY_TOKEN: {
    label: 'ntfy access token',
    secret: true,
    placeholder: 'only for a server that needs a login',
  },
  PUBLIC_URL: {
    label: 'App address (opened by tapping a reminder)',
    secret: false,
    placeholder: 'https://my-pc.tailnet.ts.net',
  },
} as const

export type SettingKey = keyof typeof SETTINGS
export const SETTING_KEYS = Object.keys(SETTINGS) as Array<SettingKey>

/** What the browser sees of a setting. */
export type SettingView = {
  /** The value (non-secret settings only). */
  value: string
  /** Where the effective value comes from. */
  source: 'saved' | 'env' | null
  /** Secrets: the last 4 characters, to recognise it. */
  hint?: string
}
export type SettingsView = Record<SettingKey, SettingView>

/** A save: each key given is set (trimmed) or, when '', removed (falling
 * back to the env). Keys left out stay as they are (e.g. an untouched
 * secret). */
export const settingsInput = z.object(
  Object.fromEntries(
    SETTING_KEYS.map((key) => [key, z.string().trim().max(2000).optional()]),
  ) as Record<SettingKey, z.ZodOptional<z.ZodString>>,
)
export type SettingsInput = z.infer<typeof settingsInput>
