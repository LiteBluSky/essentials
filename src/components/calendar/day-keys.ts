// Vim keys for react-day-picker grids (the month and the dialog's range
// picker): h/j/k/l and m/M are re-sent to the focused day as the keys
// DayPicker already handles (arrows, PageDown / PageUp), so focus, month
// changes and selection all stay DayPicker's own.

export const DAY_KEY_ALIASES: Record<string, string> = {
  h: 'ArrowLeft',
  l: 'ArrowRight',
  k: 'ArrowUp',
  j: 'ArrowDown',
  m: 'PageDown',
  M: 'PageUp',
}

/** Re-sends a vim key to a day button as DayPicker's key. True if it was one. */
export function sendDayKey(target: EventTarget | null, key: string) {
  const alias = DAY_KEY_ALIASES[key]
  if (!alias || !(target instanceof HTMLElement)) return false
  if (!target.closest('td[data-day]')) return false
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: alias, bubbles: true }),
  )
  return true
}
