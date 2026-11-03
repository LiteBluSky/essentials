import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  BookmarkIcon,
  FolderPlusIcon,
  KeyboardIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { BookmarkTree } from '@/components/bookmarks/bookmark-tree'
import type { EditorState } from '@/components/bookmarks/editor'
import { EditorDialogs } from '@/components/bookmarks/editor-dialogs'
import { FavoritesList } from '@/components/bookmarks/favorites-list'
import { ImportExportMenu } from '@/components/bookmarks/import-export-menu'
import { ShortcutsDialog } from '@/components/bookmarks/shortcuts-dialog'
import { TreeDndProvider } from '@/components/bookmarks/tree-dnd'
import { AppNav } from '@/components/app-nav'
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
import { useCutLink } from '@/hooks/bookmarks/use-cut-link'
import { useAppSwitch } from '@/hooks/use-app-switch'
import { useExpandedFolders } from '@/hooks/use-expanded-folders'
import { useFavorite } from '@/hooks/bookmarks/use-favorite'
import { useTreeKeyboard } from '@/hooks/bookmarks/use-tree-keyboard'
import { APP_NAME } from '@/lib/config'
import { MOD_LABEL, SHORTCUTS, useShortcuts } from '@/lib/shortcuts'
import type { ShortcutName } from '@/lib/shortcuts'
import {
  buildTree,
  favoriteLinks,
  filterTree,
  findFolder,
} from '@/lib/bookmarks/tree'
import { bookmarksTreeQueryOptions } from '@/server/bookmarks.functions'

export const Route = createFileRoute('/bookmarks')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(bookmarksTreeQueryOptions),
  head: () => ({ meta: [{ title: `Bookmarks · ${APP_NAME}` }] }),
  component: Home,
})

function Home() {
  const { data } = useSuspenseQuery(bookmarksTreeQueryOptions)
  const tree = useMemo(() => buildTree(data.folders, data.links), [data])

  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterTree(tree, query), [tree, query])
  const searching = query.trim().length > 0
  const favorites = useMemo(() => favoriteLinks(data.links), [data])
  const toggleFavorite = useFavorite()

  const { expanded, setOpen, collapseAll } = useExpandedFolders('bookmarks')

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const dialogOpen = editorOpen || helpOpen
  const openEditor = (state: EditorState) => {
    setEditor(state)
    setEditorOpen(true)
  }

  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = () => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }
  const clipboard = useCutLink({
    tree,
    links: data.links,
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
        const link = data.links.find((l) => l.id === id)
        if (link) openEditor({ kind, link, folderId: link.folderId })
      }
    },
    onDelete: (kind, id) => {
      if (kind === 'folder') {
        const node = findFolder(tree, id)
        if (node) openEditor({ kind: 'delete-folder', node })
      } else {
        const link = data.links.find((l) => l.id === id)
        if (link) openEditor({ kind: 'delete-link', link })
      }
    },
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onCancelCut: clipboard.cancel,
    onToggleFavorite: toggleFavorite,
    onOpenFavorite: (index) => {
      const link = favorites.at(index)
      if (link) window.open(link.url, '_blank', 'noreferrer')
    },
    onSwitchApp: switchApp,
    enabled: !dialogOpen,
  })
  // Disabled while a dialog is open so shortcuts don't stack editors.
  useShortcuts(
    {
      search: focusSearch,
      newItem: () => openEditor({ kind: 'link', folderId: null }),
      newFolder: () => openEditor({ kind: 'folder', parentId: null }),
    },
    !dialogOpen,
  )

  const isEmpty = !tree.folders.length && !tree.links.length
  const noMatches = !visible.folders.length && !visible.links.length

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      {/* Below 500px the actions drop under the app switcher. */}
      <header className="flex items-center justify-between gap-4 max-[500px]:flex-col max-[500px]:items-stretch">
        <AppNav />
        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => openEditor({ kind: 'folder', parentId: null })}
            >
              <FolderPlusIcon data-icon="inline-start" />
              Folder
              <ShortcutHint name="newFolder" />
            </Button>
            <Button
              onClick={() => openEditor({ kind: 'link', folderId: null })}
            >
              <PlusIcon data-icon="inline-start" />
              Link
              <ShortcutHint name="newItem" />
            </Button>
          </div>
          <ButtonGroup aria-label="Settings">
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
          </ButtonGroup>
        </div>
      </header>

      {/* Own provider so the menu's move up/down works outside the tree. */}
      <TreeDndProvider
        tree={tree}
        enabled={false}
        onExpand={(id) => setOpen(id, true)}
      >
        <FavoritesList
          favorites={favorites}
          onEdit={openEditor}
          onToggleFavorite={toggleFavorite}
        />
      </TreeDndProvider>

      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          type="search"
          aria-label="Search links"
          placeholder="Search links…"
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
              <BookmarkIcon />
            </EmptyMedia>
            <EmptyTitle>No links yet</EmptyTitle>
            <EmptyDescription>
              Add your first link, or create a folder to organise them.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => openEditor({ kind: 'link', folderId: null })}
            >
              <PlusIcon data-icon="inline-start" />
              Add link
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
            <BookmarkTree
              tree={visible}
              expanded={expanded}
              forceOpen={searching}
              onToggle={setOpen}
              onEdit={openEditor}
              cutId={clipboard.cutId}
              onToggleFavorite={toggleFavorite}
            />
          </TreeDndProvider>
        </div>
      )}

      <EditorDialogs
        tree={tree}
        state={editor}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  )
}

function ShortcutHint({ name }: { name: ShortcutName }) {
  return (
    <KbdGroup className="max-sm:hidden">
      <Kbd>{MOD_LABEL}</Kbd>
      <Kbd>{SHORTCUTS[name].label}</Kbd>
    </KbdGroup>
  )
}
