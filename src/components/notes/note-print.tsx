import { useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import type { ReactNode } from 'react'

import type { Note } from '@/db/schema'
import { noteLabel } from '@/lib/notes/tree'
import { Markdown } from './markdown'

type Job = { note: Note; path: Array<string> }

const edited = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// Exports a note as a PDF through the browser's print dialog ("Save as
// PDF"): the note is rendered into a print-only portal (`[data-note-print]`
// in styles.css hides everything else) and the page is titled after it, which
// browsers use as the default file name. Real, selectable text, no library.
export function usePrintNote(): [
  print: (note: Note, path: Array<string>) => void,
  element: ReactNode,
] {
  const [job, setJob] = useState<Job | null>(null)

  const print = (note: Note, path: Array<string>) => {
    flushSync(() => setJob({ note, path }))
    const title = document.title
    document.title = noteLabel(note)
    window.addEventListener(
      'afterprint',
      () => {
        document.title = title
        setJob(null)
      },
      { once: true },
    )
    window.print()
  }

  const element =
    job &&
    createPortal(
      <article data-note-print className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {[...job.path, `Edited ${edited.format(job.note.updatedAt)}`].join(
              ' / ',
            )}
          </p>
          {job.note.title && (
            <h1 className="text-2xl leading-tight font-semibold">
              {job.note.title}
            </h1>
          )}
        </header>
        <Markdown>{job.note.body}</Markdown>
      </article>,
      document.body,
    )

  return [print, element]
}
