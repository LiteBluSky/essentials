import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  FolderPlusIcon,
  KeyboardIcon,
  NotebookPenIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { EditorState } from '@/components/notes/editor'
import { EditorDialogs } from '@/components/notes/editor-dialogs'
import { ImportExportMenu } from '@/components/notes/import-export-menu'
import { NoteTree } from '@/components/notes/note-tree'
import { QuickNotes } from '@/components/notes/quick-notes'
import { ShortcutsDialog } from '@/components/notes/shortcuts-dialog'
import { TreeDndProvider } from '@/components/notes/tree-dnd'
import { AppFooter } from '@/components/app-footer'
import { AppNav } from '@/components/app-nav'
import { AssistantBox } from '@/components/assistant-box'
import { GlobalSearch } from '@/components/global-search'
import { ProfileButton } from '@/components/profile-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { useCutNote } from '@/hooks/notes/use-cut-note'
import { useAppSwitch } from '@/hooks/use-app-switch'
import { useExpandedFolders } from '@/hooks/use-expanded-folders'
import { useGlobalSearch } from '@/hooks/use-global-search'
import { useTreeKeyboard } from '@/hooks/notes/use-tree-keyboard'
import { useViewNote } from '@/hooks/notes/use-view-note'
import { APP_NAME } from '@/lib/config'
import { MOD_LABEL, SHORTCUTS, useShortcuts } from '@/lib/shortcuts'
import type { ShortcutName } from '@/lib/shortcuts'
import {
  QUICK_COUNT,
  buildTree,
  filterTree,
  findFolder,
  quickNotes,
} from '@/lib/notes/tree'
import { databasesQueryOptions } from '@/server/databases.functions'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import { notesTreeQueryOptions } from '@/server/notes.functions'

export const Route = createFileRoute('/notes')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(notesTreeQueryOptions),
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
      context.queryClient.ensureQueryData(databasesQueryOptions),
    ]),
  head: () => ({ meta: [{ title: `Notes · ${APP_NAME}` }] }),
  component: Home,
})

function Home() {
  const { data } = useSuspenseQuery(notesTreeQueryOptions)
  const tree = useMemo(() => buildTree(data.folders, data.notes), [data])

  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterTree(tree, query), [tree, query])
  const searching = query.trim().length > 0
  const quick = useMemo(() => quickNotes(data.notes), [data.notes])
  const viewNote = useViewNote()

  const { expanded, setOpen, collapseAll } = useExpandedFolders('notes')

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const openEditor = (state: EditorState) => {
    // Opening a note's preview counts for "Recent" / "Most viewed".
    if (state.kind === 'note' && state.mode === 'view') viewNote(state.noteId)
    setEditor(state)
    setEditorOpen(true)
  }
  const newNote = (folderId: number | null = null) =>
    openEditor({ kind: 'note', mode: 'edit', folderId })

  // `z` / the header button: search every app. Picks for this app land here.
  const globalSearch = useGlobalSearch({
    app: 'notes',
    folders: data.folders,
    setFolderOpen: setOpen,
    clearSearch: () => setQuery(''),
    openItem: (id) => openEditor({ kind: 'note', mode: 'view', noteId: id }),
    enabled: !editorOpen && !helpOpen,
  })
  const dialogOpen = editorOpen || helpOpen || globalSearch.open

  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = () => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }
  const clipboard = useCutNote({
    tree,
    notes: data.notes,
    onExpand: (id) => setOpen(id, true),
  })

  const switchApp = useAppSwitch()
  const treeRef = useRef<HTMLDivElement>(null)
  useTreeKeyboard({
    containerRef: treeRef,
    expanded,
    setOpen,
    collapseAll,
    onSearch: focusSearch,
    onClearSearch: () => {
      if (!searching) return false
      // Folders stop being forced open, so expand the focused row's
      // ancestors to keep it visible (and focused).
      const active = document.activeElement
      let parentId =
        active instanceof HTMLElement && active.dataset.parentId
          ? Number(active.dataset.parentId)
          : null
      while (parentId !== null) {
        setOpen(parentId, true)
        const id: number = parentId
        parentId = data.folders.find((f) => f.id === id)?.parentId ?? null
      }
      setQuery('')
      return true
    },
    onHelp: () => setHelpOpen(true),
    onEdit: (kind, id) => {
      if (kind === 'folder') {
        const folder = data.folders.find((f) => f.id === id)
        if (folder) openEditor({ kind, folder, parentId: folder.parentId })
      } else {
        const note = data.notes.find((n) => n.id === id)
        if (note) {
          openEditor({ kind, mode: 'edit', note, folderId: note.folderId })
        }
      }
    },
    onDelete: (kind, id) => {
      if (kind === 'folder') {
        const node = findFolder(tree, id)
        if (node) openEditor({ kind: 'delete-folder', node })
      } else {
        const note = data.notes.find((n) => n.id === id)
        if (note) openEditor({ kind: 'delete-note', note })
      }
    },
    onNew: (folderId) => {
      if (folderId !== null) setOpen(folderId, true)
      newNote(folderId)
    },
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onCancelCut: clipboard.cancel,
    onOpenQuick: (index) => {
      // Keys 1-4: recent, 5-8: most viewed.
      const note =
        index < QUICK_COUNT
          ? quick.recent.at(index)
          : quick.popular.at(index - QUICK_COUNT)
      if (note) openEditor({ kind: 'note', mode: 'view', noteId: note.id })
    },
    onSwitchApp: switchApp,
    enabled: !dialogOpen,
  })
  // Disabled while a dialog is open so shortcuts don't stack editors.
  useShortcuts(
    {
      search: focusSearch,
      newFolder: () => openEditor({ kind: 'folder', parentId: null }),
    },
    !dialogOpen,
  )

  const isEmpty = !tree.folders.length && !tree.notes.length
  const noMatches = !visible.folders.length && !visible.notes.length

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-8">
      {/* Below 500px the actions drop under the app switcher. */}
      <header className="flex items-center justify-between gap-4 max-[500px]:flex-col max-[500px]:items-stretch">
        <AppNav />
        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              aria-label="New folder"
              className={ICON_ON_PHONES}
              onClick={() => openEditor({ kind: 'folder', parentId: null })}
            >
              <FolderPlusIcon data-icon="inline-start" />
              <span className="max-sm:hidden">Folder</span>
              <ShortcutHint name="newFolder" />
            </Button>
            <Button
              aria-label="New note"
              className={ICON_ON_PHONES}
              onClick={() => newNote()}
            >
              <PlusIcon data-icon="inline-start" />
              <span className="max-sm:hidden">Note</span>
              <Kbd className="max-sm:hidden">a</Kbd>
            </Button>
          </div>
          <ButtonGroup aria-label="Settings">
            <Button
              variant="outline"
              size="icon"
              aria-label="Search everything"
              title="Search everything (z)"
              onClick={() => globalSearch.setOpen(true)}
            >
              <SearchIcon />
            </Button>
            <ImportExportMenu tree={tree} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              onClick={() => setHelpOpen(true)}
            >
              <KeyboardIcon />
            </Button>
            <ThemeToggle />
            <ProfileButton />
          </ButtonGroup>
        </div>
      </header>

      <AssistantBox enabled={!dialogOpen} />

      {/* Own provider so the menu's move up/down works outside the tree. */}
      <TreeDndProvider
        tree={tree}
        enabled={false}
        onExpand={(id) => setOpen(id, true)}
      >
        <QuickNotes
          recent={quick.recent}
          popular={quick.popular}
          onEdit={openEditor}
        />
      </TreeDndProvider>

      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          type="search"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('')
              e.currentTarget.blur()
            }
            // Jump into the tree (first match while searching).
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              const first =
                treeRef.current?.querySelector<HTMLElement>('[data-tree-item]')
              if (first) {
                e.preventDefault()
                first.focus()
              }
            }
          }}
        />
        {!searching && (
          <InputGroupAddon align="inline-end">
            <ShortcutHint name="search" />
          </InputGroupAddon>
        )}
      </InputGroup>

      <Separator />

      {isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPenIcon />
            </EmptyMedia>
            <EmptyTitle>No notes yet</EmptyTitle>
            <EmptyDescription>
              Write your first note, or create a folder to organise them.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => newNote()}>
              <PlusIcon data-icon="inline-start" />
              New note
            </Button>
          </EmptyContent>
        </Empty>
      ) : noMatches ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              Nothing matches “{query.trim()}”.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div ref={treeRef}>
          <TreeDndProvider
            tree={tree}
            enabled={!searching}
            onExpand={(id) => setOpen(id, true)}
          >
            <NoteTree
              tree={visible}
              expanded={expanded}
              forceOpen={searching}
              onToggle={setOpen}
              onEdit={openEditor}
              cutId={clipboard.cutId}
            />
          </TreeDndProvider>
        </div>
      )}

      <EditorDialogs
        tree={tree}
        notes={data.notes}
        state={editor}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onChange={openEditor}
      />
      <GlobalSearch
        open={globalSearch.open}
        onOpenChange={globalSearch.setOpen}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <AppFooter />
    </main>
  )
}

/** Header buttons that show only their icon below `sm` (phones). */
const ICON_ON_PHONES = 'max-sm:w-8 max-sm:p-0!'

function ShortcutHint({ name }: { name: ShortcutName }) {
  return (
    <KbdGroup className="max-sm:hidden">
      <Kbd>{MOD_LABEL}</Kbd>
      <Kbd>{SHORTCUTS[name].label}</Kbd>
    </KbdGroup>
  )
}
