import type { Folder, Note } from '@/db/schema'
import type { FolderNode } from '@/lib/notes/tree'

// What the page's dialogs are currently showing. One at a time. A note opens
// in "view" (rendered preview, read live from the tree query) and switches to
// "edit" (the form) in the same dialog.
export type EditorState =
  | { kind: 'note'; mode: 'view'; noteId: number }
  | { kind: 'note'; mode: 'edit'; note?: Note; folderId: number | null }
  | { kind: 'folder'; folder?: Folder; parentId: number | null }
  | { kind: 'delete-note'; note: Note }
  | { kind: 'delete-folder'; node: FolderNode }

export type OpenEditor = (state: EditorState) => void
