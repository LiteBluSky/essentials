// Money helpers for the Finances app (pure). Amounts are stored as whole
// cents; there's no conversion between currencies (that would need an
// outside call), so totals are kept per currency.

export const DEFAULT_CURRENCY = 'EUR'

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const
export type Currency = (typeof CURRENCIES)[number]

/** Symbols and codes typed in the quick entry ("$12", "12 usd"). */
const CURRENCY_WORDS: Record<string, Currency | undefined> = {
  '€': 'EUR',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  $: 'USD',
  usd: 'USD',
  '£': 'GBP',
  gbp: 'GBP',
  chf: 'CHF',
}

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

export type ParsedEntry = {
  cents: number
  title: string
  /** Set by a leading + (income) or - (expense). */
  kind?: 'expense' | 'income'
  /** Set by a symbol or code ("$", "usd"). */
  currency?: Currency
}

/**
 * The quick entry: an amount and what it was, in any order ("12.50
 * coffee", "coffee 12,50", "+1500 payroll", "$20 book", "20 usd book").
 * Null without an amount.
 */
export function parseEntry(text: string): ParsedEntry | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  let kind: ParsedEntry['kind']
  let currency: Currency | undefined
  let cents: number | null = null
  const rest: Array<string> = []
  for (const w of words) {
    if (cents === null) {
      // A sign and / or a symbol glued to the number: "+€12", "12€", "-5".
      const m = /^([+-])?([€$£])?(\d[\d.,]*)([€$£])?$/.exec(w)
      if (m) {
        const amount = parseAmount(m[3])
        if (amount !== null) {
          cents = amount
          if (m[1]) kind = m[1] === '+' ? 'income' : 'expense'
          // Unmatched groups are undefined (not '').
          const symbol = (m[2] as string | undefined) ?? m[4]
          if (symbol) currency = CURRENCY_WORDS[symbol]
          continue
        }
      }
    }
    const code = CURRENCY_WORDS[w.toLowerCase()]
    if (code && !currency) {
      currency = code
      continue
    }
    if ((w === '+' || w === '-') && cents === null) {
      kind = w === '+' ? 'income' : 'expense'
      continue
    }
    rest.push(w)
  }
  if (cents === null) return null
  const title = rest.join(' ')
  return {
    cents,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    kind,
    currency,
  }
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
