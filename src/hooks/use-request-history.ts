import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { assistantHistoryQueryOptions } from '@/server/assistant.functions'

/** Each request once, newest first. */
function uniqueTexts(texts: Array<string>) {
  const seen = new Set<string>()
  return texts.filter((text) => {
    const key = text.trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Terminal-style recall of past requests to Jarvis (the history dialog's
 * entries, Ask Jarvis and Chat alike) for a text field: `recall(1)` steps to
 * an older one, `recall(-1)` back towards the newest and then to what was
 * being typed before. The history is loaded on first use, and again only
 * once a new request has invalidated it.
 */
export function useRequestHistory() {
  const queryClient = useQueryClient()
  // Which entry is shown (0 = newest); null = not browsing.
  const index = useRef<number | null>(null)
  const draft = useRef('')

  /** The text to show `step` away (1 = older), or null for no change. */
  const recall = useCallback(
    async (step: 1 | -1, current: string): Promise<string | null> => {
      if (step === -1 && index.current === null) return null
      const { entries } = await queryClient.fetchQuery({
        ...assistantHistoryQueryOptions,
        staleTime: Infinity,
      })
      const texts = uniqueTexts(entries.map((e) => e.text))
      if (index.current === null) draft.current = current
      const next = (index.current ?? -1) + step
      if (next < 0) {
        index.current = null
        return draft.current
      }
      if (next >= texts.length) return null
      index.current = next
      return texts[next]
    },
    [queryClient],
  )

  const browsing = useCallback(() => index.current !== null, [])
  const reset = useCallback(() => {
    index.current = null
  }, [])

  return { recall, browsing, reset }
}
