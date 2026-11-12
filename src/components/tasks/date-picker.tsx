import { format, isToday } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useCalendarKeys } from '@/hooks/tasks/use-calendar-keys'
import { CalendarKeysHint } from './calendar-dialog'

/**
 * A day picker (shadcn Calendar in a Popover) for a task's due date. Only
 * the day is chosen (the form has its own time field). Opens on today when
 * empty. Keys: h/l day, j/k week, m/M month, y/Y year, Enter picks.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick a day',
}: {
  id?: string
  value: Date | null
  onChange: (date: Date) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  // The keys need a day to move from: today until one is picked.
  const [today] = useState(() => new Date())
  const shown = value ?? today
  const keys = useCalendarKeys(shown, onChange)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) keys.setMonth(shown)
      }}
    >
      <PopoverTrigger
        id={id}
        render={
          <Button
            variant="outline"
            className="w-full justify-start font-normal"
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {value ? (
          <>
            {format(value, 'EEE d MMM yyyy')}
            {isToday(value) && (
              <span className="text-muted-foreground">(today)</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent
        ref={keys.ref}
        align="start"
        className="w-auto p-0"
        onKeyDownCapture={keys.onKeyDownCapture}
      >
        <Calendar
          mode="single"
          required
          autoFocus
          selected={shown}
          onSelect={(date) => {
            onChange(date)
            setOpen(false)
          }}
          month={keys.month}
          onMonthChange={keys.setMonth}
        />
        <CalendarKeysHint action="pick" actionKey="Enter" />
      </PopoverContent>
    </Popover>
  )
}
