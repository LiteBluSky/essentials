import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import {
  adviceInput,
  budgetInput,
  byId,
  categorizeInput,
  newEntryInput,
  subscriptionInput,
  updateEntryInput,
  updateSubscriptionInput,
} from '@/lib/finances/schemas'
import {
  categorizeEntries,
  editEntry,
  editSubscription,
  getAdvice,
  insertEntry,
  insertSubscription,
  loadFinances,
  removeEntry,
  removeSubscription,
  setBudget,
} from './finances.server'
import { acceptPending, skipPending } from './finances-due.server'
import { closeMonth } from './finances-months.server'

// No auth by design (see CLAUDE.md). The AI is only called by
// `categorizeFinanceEntries` and `askFinanceAdvice`, i.e. when the user
// asked for it.

export const getFinances = createServerFn({ method: 'GET' }).handler(() =>
  loadFinances(),
)

export const financesQueryOptions = queryOptions({
  queryKey: ['finances', 'data'],
  queryFn: () => getFinances(),
})

/** Saves an entry; `autoCategorize` is handled by the client afterwards
 * (`categorizeFinanceEntries`), so saving never waits for the AI. */
export const createFinanceEntry = createServerFn({ method: 'POST' })
  .validator(newEntryInput)
  .handler(({ data: { autoCategorize: _, ...input } }) => insertEntry(input))

export const updateFinanceEntry = createServerFn({ method: 'POST' })
  .validator(updateEntryInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editEntry(id, input)
  })

export const deleteFinanceEntry = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeEntry(data.id)
  })

export const categorizeFinanceEntries = createServerFn({ method: 'POST' })
  .validator(categorizeInput)
  .handler(async ({ data }) => ({ done: await categorizeEntries(data.ids) }))

export const createSubscription = createServerFn({ method: 'POST' })
  .validator(subscriptionInput)
  .handler(({ data }) => insertSubscription(data))

export const updateSubscription = createServerFn({ method: 'POST' })
  .validator(updateSubscriptionInput)
  .handler(async ({ data: { id, ...input } }) => {
    await editSubscription(id, input)
  })

export const deleteSubscription = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await removeSubscription(data.id)
  })

export const saveBudget = createServerFn({ method: 'POST' })
  .validator(budgetInput)
  .handler(async ({ data }) => {
    await setBudget(data.category, data.cents)
  })

export const askFinanceAdvice = createServerFn({ method: 'POST' })
  .validator(adviceInput)
  .handler(({ data }) => getAdvice(data.question, data.month, data.webSearch))

/** A recurring expense / income that fell due: accept = add it as an
 * entry on its day; skip = drop it. */
export const acceptPendingCharge = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => ({ entryId: await acceptPending(data.id) }))

export const skipPendingCharge = createServerFn({ method: 'POST' })
  .validator(byId)
  .handler(async ({ data }) => {
    await skipPending(data.id)
  })

/** Closes the oldest past month still open (folds it into its totals). */
export const closeFinanceMonth = createServerFn({ method: 'POST' }).handler(
  async () => ({ month: await closeMonth() }),
)
