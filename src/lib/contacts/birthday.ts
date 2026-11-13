// A contact's birthday: `MM-DD`, or `YYYY-MM-DD` when the year is known
// ('' = none). No time, no timezone: a day of the year. Pure helpers, used
// by the form, the details view and the server's birthday reminder.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** The hour (server's local time) a birthday is pushed on its day. */
export const BIRTHDAY_HOUR = 9

const PATTERN = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/

export type Birthday = { year: number | null; month: number; day: number }

function daysIn(month: number, year: number | null) {
  // Without a year, 29 February is allowed.
  return new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate()
}

/** The parts of a stored birthday; null when empty or not a real date. */
export function parseBirthday(value: string): Birthday | null {
  const match = PATTERN.exec(value)
  if (!match) return null
  const year = match[1] ? Number(match[1]) : null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return null
  if (day > daysIn(month, year)) return null
  if (year !== null && (year < 1900 || year > 2100)) return null
  return { year, month, day }
}

/** The stored form of the parts. */
export function formatBirthdayValue({ year, month, day }: Birthday) {
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return year === null ? md : `${year}-${md}`
}

/** "14 March 1990" / "14 March". */
export function birthdayLabel(birthday: Birthday) {
  return [birthday.day, MONTHS[birthday.month - 1], birthday.year]
    .filter((part) => part !== null)
    .join(' ')
}

const isLeap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** Whether `date` (its local day) is the birthday; 29 February counts on
 * the 28th in other years. */
export function isBirthdayOn(birthday: Birthday, date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (birthday.month === 2 && birthday.day === 29 && !isLeap(year)) {
    return month === 2 && day === 28
  }
  return birthday.month === month && birthday.day === day
}

/** The age they turn (or turned) in `year`; null without a birth year. */
export function ageIn(birthday: Birthday, year: number) {
  return birthday.year === null ? null : year - birthday.year
}

/** Their age on `date`; null without a birth year. */
export function ageOn(birthday: Birthday, date: Date) {
  if (birthday.year === null) return null
  const month = date.getMonth() + 1
  const before =
    month < birthday.month ||
    (month === birthday.month && date.getDate() < birthday.day)
  return date.getFullYear() - birthday.year - (before ? 1 : 0)
}
