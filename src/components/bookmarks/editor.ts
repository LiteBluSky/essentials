import type { Folder, Link } from '@/db/schema'
import type { FolderNode } from '@/lib/bookmarks/tree'

// What the page's dialogs are currently editing. One at a time.
export type EditorState =
  | { kind: 'link'; link?: Link; folderId: number | null }
  | { kind: 'folder'; folder?: Folder; parentId: number | null }
  | { kind: 'delete-link'; link: Link }
  | { kind: 'delete-folder'; node: FolderNode }

export type OpenEditor = (state: EditorState) => void
