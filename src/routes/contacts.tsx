import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  ContactRoundIcon,
  FolderPlusIcon,
  KeyboardIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { ContactTree } from '@/components/contacts/contact-tree'
import type { EditorState } from '@/components/contacts/editor'
import { EditorDialogs } from '@/components/contacts/editor-dialogs'
import { ImportExportMenu } from '@/components/contacts/import-export-menu'
import { ShortcutsDialog } from '@/components/contacts/shortcuts-dialog'
import { TreeDndProvider } from '@/components/contacts/tree-dnd'
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
import { useCutContact } from '@/hooks/contacts/use-cut-contact'
import { useAppSwitch } from '@/hooks/use-app-switch'
import { useExpandedFolders } from '@/hooks/use-expanded-folders'
import { useGlobalSearch } from '@/hooks/use-global-search'
import { useTreeKeyboard } from '@/hooks/contacts/use-tree-keyboard'
import { APP_NAME } from '@/lib/config'
import { MOD_LABEL, SHORTCUTS, useShortcuts } from '@/lib/shortcuts'
import type { ShortcutName } from '@/lib/shortcuts'
import { buildTree, filterTree, findFolder } from '@/lib/contacts/tree'
import { databasesQueryOptions } from '@/server/databases.functions'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import { contactsTreeQueryOptions } from '@/server/contacts.functions'

export const Route = createFileRoute('/contacts')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(contactsTreeQueryOptions),
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
      context.queryClient.ensureQueryData(databasesQueryOptions),
    ]),
  head: () => ({ meta: [{ title: `Contacts · ${APP_NAME}` }] }),
  component: Home,
})

function Home() {
  const { data } = useSuspenseQuery(contactsTreeQueryOptions)
  const tree = useMemo(() => buildTree(data.folders, data.contacts), [data])

  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterTree(tree, query), [tree, query])
  const searching = query.trim().length > 0

  const { expanded, setOpen, collapseAll } = useExpandedFolders('contacts')

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const openEditor = (state: EditorState) => {
    setEditor(state)
    setEditorOpen(true)
  }

  // `z` / the header button: search every app. Picks for this app land here.
  const globalSearch = useGlobalSearch({
    app: 'contacts',
    folders: data.folders,
    setFolderOpen: setOpen,
    clearSearch: () => setQuery(''),
    openItem: (id) =>
      openEditor({ kind: 'contact', mode: 'view', contactId: id }),
    enabled: !editorOpen && !helpOpen,
  })
  const dialogOpen = editorOpen || helpOpen || globalSearch.open

  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = () => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }
  const clipboard = useCutContact({
    tree,
    contacts: data.contacts,
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
        const contact = data.contacts.find((c) => c.id === id)
        if (contact) {
          openEditor({
            kind: 'contact',
            mode: 'edit',
            contact,
            folderId: contact.folderId,
          })
        }
      }
    },
    onDelete: (kind, id) => {
      if (kind === 'folder') {
        const node = findFolder(tree, id)
        if (node) openEditor({ kind: 'delete-folder', node })
      } else {
        const contact = data.contacts.find((c) => c.id === id)
        if (contact) openEditor({ kind: 'delete-contact', contact })
      }
    },
    onNew: (folderId) => {
      if (folderId !== null) setOpen(folderId, true)
      openEditor({ kind: 'contact', mode: 'edit', folderId })
    },
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onCancelCut: clipboard.cancel,
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

  const isEmpty = !tree.folders.length && !tree.contacts.length
  const noMatches = !visible.folders.length && !visible.contacts.length

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-8">
      {/* On phones the actions drop under the app select, spread across. */}
      <header className="flex items-center justify-between gap-4 max-lg:flex-col max-lg:items-stretch">
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
              <span className="max-lg:hidden">Folder</span>
              <ShortcutHint name="newFolder" />
            </Button>
            <Button
              aria-label="New contact"
              className={ICON_ON_PHONES}
              onClick={() =>
                openEditor({ kind: 'contact', mode: 'edit', folderId: null })
              }
            >
              <PlusIcon data-icon="inline-start" />
              <span className="max-lg:hidden">Contact</span>
              <Kbd className="max-lg:hidden">a</Kbd>
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

      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          type="search"
          aria-label="Search contacts"
          placeholder="Search contacts…"
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
              <ContactRoundIcon />
            </EmptyMedia>
            <EmptyTitle>No contacts yet</EmptyTitle>
            <EmptyDescription>
              Add someone, or create a folder to group them (family, work…).
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() =>
                openEditor({ kind: 'contact', mode: 'edit', folderId: null })
              }
            >
              <PlusIcon data-icon="inline-start" />
              Add contact
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
            <ContactTree
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
        contacts={data.contacts}
        state={editor}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onChange={setEditor}
        onSaved={(id) => {
          // Keep the contact visible in the tree: open its folders.
          let folderId =
            data.contacts.find((c) => c.id === id)?.folderId ?? null
          while (folderId !== null) {
            setOpen(folderId, true)
            const current: number = folderId
            folderId =
              data.folders.find((f) => f.id === current)?.parentId ?? null
          }
        }}
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

/** Header buttons that show only their icon below `lg` (phones, folds, upright tablets). */
const ICON_ON_PHONES = 'max-lg:w-8 max-lg:p-0!'

function ShortcutHint({ name }: { name: ShortcutName }) {
  return (
    <KbdGroup className="max-lg:hidden">
      <Kbd>{MOD_LABEL}</Kbd>
      <Kbd>{SHORTCUTS[name].label}</Kbd>
    </KbdGroup>
  )
}
