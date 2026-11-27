import { defaultFilter } from 'cmdk'

import { fold } from '@/lib/fold'

/** cmdk's own fuzzy filter, ignoring accents: pass as a `Command`'s
 * `filter` wherever it filters by itself. */
export function foldFilter(
  value: string,
  search: string,
  keywords?: Array<string>,
) {
  return defaultFilter(fold(value), fold(search), keywords?.map(fold))
}
