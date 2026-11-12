import { createServerFn } from '@tanstack/react-start'

import { referenceInput, searchInput } from '@/lib/global-search'
import { findReference, search } from './search.server'

// The global search (`z`): a few matches from every app, not their whole
// trees. No auth by design (see CLAUDE.md).
export const globalSearch = createServerFn({ method: 'GET' })
  .validator(searchInput)
  .handler(({ data }) => search(data.query))

// A clicked `@type(name#id)` reference: the item it points at (by id, else
// the best match for its name), with the URL for a bookmark. Null when gone.
export const resolveReference = createServerFn({ method: 'GET' })
  .validator(referenceInput)
  .handler(({ data }) => findReference(data))
