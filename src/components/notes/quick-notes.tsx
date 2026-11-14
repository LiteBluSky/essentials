import { FileTextIcon } from 'lucide-react'

import { RowContextMenu } from '@/components/row-context-menu'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { Note } from '@/db/schema'
import { QUICK_COUNT, noteLabel, noteSnippet } from '@/lib/notes/tree'
import type { OpenEditor } from './editor'
import { NoteMenu, NoteMenuItems } from './note-tree'

// "Recent" (keys 1-4) and "Most viewed" (keys 5-8) above the tree. Each row
// shows the note's title, or the start of its text, and has the same hover
// menu as the note in the tree.
export function QuickNotes({
  recent,
  popular,
  onEdit,
}: {
  recent: Array<Note>
  popular: Array<Note>
  onEdit: OpenEditor
}) {
  if (!recent.length) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <QuickList title="Recent" notes={recent} firstKey={1} onEdit={onEdit} />
      {popular.length > 0 && (
        <QuickList
          title="Most viewed"
          notes={popular}
          firstKey={QUICK_COUNT + 1}
          onEdit={onEdit}
        />
      )}
    </div>
  )
}

function QuickList({
  title,
  notes,
  firstKey,
  onEdit,
}: {
  title: string
  notes: Array<Note>
  firstKey: number
  onEdit: OpenEditor
}) {
  const id = `quick-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <h2
        id={id}
        className="px-2.5 pb-1 text-sm font-medium text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-col">
        {notes.map((note, i) => (
          <RowContextMenu
            key={note.id}
            menu={<NoteMenuItems note={note} onEdit={onEdit} />}
            render={<li className="group/row flex items-center gap-1" />}
          >
            <Button
              variant="ghost"
              className="min-w-0 flex-1 justify-start"
              title={noteSnippet(note.body) || undefined}
              onClick={() =>
                onEdit({ kind: 'note', mode: 'view', noteId: note.id })
              }
            >
              <Kbd>{firstKey + i}</Kbd>
              <FileTextIcon />
              <span className="truncate">{noteLabel(note)}</span>
            </Button>
            <NoteMenu note={note} onEdit={onEdit} />
          </RowContextMenu>
        ))}
      </ul>
    </section>
  )
}
