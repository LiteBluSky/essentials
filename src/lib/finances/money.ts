// Money helpers for the Finances app (pure). Amounts are stored as whole
// cents; there's no conversion between currencies (that would need an
// outside call), so totals are kept per currency.

export const DEFAULT_CURRENCY = 'EUR'

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const
export type Currency = (typeof CURRENCIES)[number]

/** "€12.50", "-€3.00"; `signed` puts + on income. */
export function formatMoney(
  cents: number,
  currency: string = DEFAULT_CURRENCY,
  { signed = false }: { signed?: boolean } = {},
) {
  const text = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(Math.abs(cents) / 100)
  if (cents < 0) return `−${text}`
  return signed && cents > 0 ? `+${text}` : text
}

/** "12.50" for an input. */
export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2)
}

/** "12", "12.5", "12,50", "1.234,56", "1,234.56" → cents; null if none. */
export function parseAmount(text: string): number | null {
  let s = text.trim().replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  // The last separator is the decimal one when 1–2 digits follow it.
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    s = `${s.slice(0, lastSep).replace(/[.,]/g, '')}.${s.slice(lastSep + 1)}`
  } else {
    s = s.replace(/[.,]/g, '')
  }
  const value = Number(s)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

/** `YYYY-MM` of a `YYYY-MM-DD` day. */
export function monthOf(day: string) {
  return day.slice(0, 7)
}

/** The month `n` months after `YYYY-MM`. */
export function addMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + n, 1))
  return date.toISOString().slice(0, 7)
}

/** "November 2026". */
export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}
