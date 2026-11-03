import type { Folder, Task } from '@/db/schema'
import type { TaskInput } from '@/lib/tasks/schemas'
import type { FolderNode } from '@/lib/tasks/tree'

// What the page's dialogs are currently showing. One at a time. A task opens
// in "view" (its details, read live from the tree query) and switches to
// "edit" (the form) in the same dialog.
export type EditorState =
  | { kind: 'task'; mode: 'view'; taskId: number }
  | {
      kind: 'task'
      mode: 'edit'
      task?: Task
      folderId: TaskInput['folderId']
    }
  | { kind: 'folder'; folder?: Folder; parentId: number | null }
  | { kind: 'delete-task'; task: Task }
  | { kind: 'delete-folder'; node: FolderNode }

export type OpenEditor = (state: EditorState) => void
