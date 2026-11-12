import type { Contact, Folder } from '@/db/schema'
import type { FolderNode } from '@/lib/contacts/tree'

// What the page's dialogs are currently showing. One at a time. A contact
// opens in "view" (its details, read live from the tree query) and switches
// to "edit" (the form) in the same dialog.
export type EditorState =
  | { kind: 'contact'; mode: 'view'; contactId: number }
  | {
      kind: 'contact'
      mode: 'edit'
      contact?: Contact
      folderId: number | null
    }
  | { kind: 'folder'; folder?: Folder; parentId: number | null }
  | { kind: 'delete-contact'; contact: Contact }
  | { kind: 'delete-folder'; node: FolderNode }

export type OpenEditor = (state: EditorState) => void
