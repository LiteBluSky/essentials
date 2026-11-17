import type { Password, Folder } from '@/db/schema'
import type { FolderNode } from '@/lib/passwords/tree'

// What the page's dialogs are currently showing. One at a time. A password
// opens in "view" (its details, read live from the tree query) and switches
// to "edit" (the form) in the same dialog.
export type EditorState =
  | { kind: 'password'; mode: 'view'; passwordId: number }
  | {
      kind: 'password'
      mode: 'edit'
      password?: Password
      folderId: number | null
    }
  | { kind: 'folder'; folder?: Folder; parentId: number | null }
  | { kind: 'delete-password'; password: Password }
  | { kind: 'delete-folder'; node: FolderNode }

export type OpenEditor = (state: EditorState) => void
