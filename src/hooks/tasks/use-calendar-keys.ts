import { addDays, addMonths, addYears } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

// Vim-style keys inside a calendar: h/l a day, j/k a week, m/M a month
// forward/back, y/Y a year forward/back. The selection moves with them.
const STEPS: Record<string, (date: Date) => Date> = {
  h: (d) => addDays(d, -1),
  l: (d) => addDays(d, 1),
  j: (d) => addDays(d, 7),
  k: (d) => addDays(d, -7),
  m: (d) => addMonths(d, 1),
  M: (d) => addMonths(d, -1),
  y: (d) => addYears(d, 1),
  Y: (d) => addYears(d, -1),
}

/**
 * Shared by the form's date picker and the calendar dialog: the month shown
 * (it follows the selection), and a capture-phase key handler (put it and
 * `ref` on an element around the shadcn Calendar) that runs before the
 * calendar's own keys and keeps focus on the selected day.
 */
export function useCalendarKeys(value: Date, onChange: (date: Date) => void) {
  const [month, setMonth] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  // Set when a key moved the selection, so its day takes focus once drawn.
  const moved = useRef(false)

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    ref.current
      ?.querySelector<HTMLElement>('[data-selected-single="true"]')
      ?.focus()
  }, [value, month])

  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const step = Object.hasOwn(STEPS, e.key) ? STEPS[e.key] : undefined
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    const next = step(value)
    moved.current = true
    onChange(next)
    setMonth(next)
  }

  return { ref, month, setMonth, onKeyDownCapture }
}
