import { createServerFn } from '@tanstack/react-start'

import { searchInput } from '@/lib/global-search'
import { search } from './search.server'

// The global search (`z`): a few matches from every app, not their whole
// trees. No auth by design (see CLAUDE.md).
export const globalSearch = createServerFn({ method: 'GET' })
  .validator(searchInput)
  .handler(({ data }) => search(data.query))
