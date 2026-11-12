import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { byId, eventInput, updateEventInput } from '@/lib/calendar/schemas'
import {
  editEvent,
  insertEvent,
  loadCalendar,
  removeEvent,
} from './calendar.server'

// No auth by design (see CLAUDE.md).

export const getCalendar = createServerFn({ method: 'GET' }).handler(() =>
  loadCalendar(),
)

export const calendarQueryOptions = queryOptions({
  queryKey: ['calendar', 'data'],
  queryFn: () => getCalendar(),
})

export const createEvent = createServerFn({ method: 'POST' })
  .validator(eventInput)
  .handler(({ data }) => insertEvent(data))

export const updateEvent = createServerFn({ method: 'POST' })
  .validator(updateEventInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editEvent(id, input)
  })

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeEvent(data.id)
  })
