// The 15 colours a calendar strip can have. Stored by key, so the shades can
// change without touching the data. The classes are spelled out in full so
// Tailwind finds them.
export const CALENDAR_COLORS = [
  { key: 'red', label: 'Red', className: 'bg-red-500 text-white' },
  { key: 'orange', label: 'Orange', className: 'bg-orange-500 text-white' },
  { key: 'amber', label: 'Amber', className: 'bg-amber-400 text-amber-950' },
  {
    key: 'yellow',
    label: 'Yellow',
    className: 'bg-yellow-300 text-yellow-950',
  },
  { key: 'lime', label: 'Lime', className: 'bg-lime-400 text-lime-950' },
  { key: 'green', label: 'Green', className: 'bg-green-600 text-white' },
  { key: 'emerald', label: 'Emerald', className: 'bg-emerald-500 text-white' },
  { key: 'teal', label: 'Teal', className: 'bg-teal-500 text-white' },
  { key: 'cyan', label: 'Cyan', className: 'bg-cyan-400 text-cyan-950' },
  { key: 'sky', label: 'Sky', className: 'bg-sky-500 text-white' },
  { key: 'blue', label: 'Blue', className: 'bg-blue-600 text-white' },
  { key: 'indigo', label: 'Indigo', className: 'bg-indigo-500 text-white' },
  { key: 'violet', label: 'Violet', className: 'bg-violet-500 text-white' },
  { key: 'pink', label: 'Pink', className: 'bg-pink-500 text-white' },
  { key: 'stone', label: 'Grey', className: 'bg-stone-500 text-white' },
] as const

export type CalendarColor = (typeof CALENDAR_COLORS)[number]['key']

export const COLOR_KEYS = CALENDAR_COLORS.map((c) => c.key) as [
  CalendarColor,
  ...Array<CalendarColor>,
]

export const DEFAULT_COLOR: CalendarColor = 'blue'

/** The strip classes for a stored colour (an unknown key falls back). */
export function colorClass(key: string) {
  return (
    CALENDAR_COLORS.find((c) => c.key === key) ??
    CALENDAR_COLORS.find((c) => c.key === DEFAULT_COLOR)!
  ).className
}
