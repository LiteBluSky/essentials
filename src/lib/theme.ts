export type Theme = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme'

// Runs inline in <head> before first paint so there's no light/dark flash.
// Also follows OS changes while the stored choice is "system" (or unset).
export const THEME_SCRIPT = `(() => {
  const key = ${JSON.stringify(THEME_STORAGE_KEY)}
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    let theme = 'system'
    try { theme = localStorage.getItem(key) || 'system' } catch {}
    const dark = theme === 'dark' || (theme === 'system' && mq.matches)
    document.documentElement.classList.toggle('dark', dark)
  }
  apply()
  mq.addEventListener('change', apply)
})()`

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage unavailable — fall through to system.
  }
  return 'system'
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore — the choice just won't persist.
  }
  const dark =
    theme === 'dark' ||
    (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

const THEME_ORDER: Array<Theme> = ['light', 'dark', 'system']

/** The theme after this one (Shift+T): light → dark → system → light. */
export function nextTheme(theme: Theme): Theme {
  return THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
}
