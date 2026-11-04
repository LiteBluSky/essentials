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
 * A day picker (shadcn Calendar in a Popover) for a new task's date. Only
 * the day is chosen; the form adds the current time when saving. Keys:
 * h/l day, j/k week, m/M month, y/Y year, Enter picks.
 */
export function DatePicker({
  id,
  value,
  onChange,
}: {
  id?: string
  value: Date
  onChange: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const keys = useCalendarKeys(value, onChange)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) keys.setMonth(value)
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
        {format(value, 'EEE d MMM yyyy')}
        {isToday(value) && (
          <span className="text-muted-foreground">(today)</span>
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
          selected={value}
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
