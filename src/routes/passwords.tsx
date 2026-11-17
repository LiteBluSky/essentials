import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  FolderPlusIcon,
  KeyRoundIcon,
  KeyboardIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PasswordTree } from '@/components/passwords/password-tree'
import type { EditorState } from '@/components/passwords/editor'
import { EditorDialogs } from '@/components/passwords/editor-dialogs'
import { ImportExportMenu } from '@/components/passwords/import-export-menu'
import { ShortcutsDialog } from '@/components/passwords/shortcuts-dialog'
import { TreeDndProvider } from '@/components/passwords/tree-dnd'
import { LockScreen } from '@/components/passwords/vault-forms'
import {
  copyPassword,
  copyUsername,
  openSite,
} from '@/components/passwords/actions'
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
import { Separator } from '@/components/ui/separator'
import { useCutPassword } from '@/hooks/passwords/use-cut-password'
import { useExpandedFolders } from '@/hooks/use-expanded-folders'
import { useGlobalSearch } from '@/hooks/use-global-search'
import { useTreeKeyboard } from '@/hooks/passwords/use-tree-keyboard'
import { APP_NAME } from '@/lib/config'
import { useShortcutLabels, useShortcuts } from '@/lib/shortcuts'
import { buildTree, filterTree, findFolder } from '@/lib/passwords/tree'
import { lockVault, touchVault, useUnlocked } from '@/lib/passwords/vault'
import { databasesQueryOptions } from '@/server/databases.functions'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import {
  passwordVaultQueryOptions,
  passwordsTreeQueryOptions,
} from '@/server/passwords.functions'
import { ShortcutKey } from '@/components/shortcut-key'

export const Route = createFileRoute('/passwords')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(passwordsTreeQueryOptions),
      context.queryClient.ensureQueryData(passwordVaultQueryOptions),
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
      context.queryClient.ensureQueryData(databasesQueryOptions),
    ]),
  head: () => ({ meta: [{ title: `Passwords · ${APP_NAME}` }] }),
  component: Home,
})

// The Passwords app: logins in folders, like Contacts, but each password
// and its notes are encrypted in the browser with the master password
// (lib/passwords/vault.ts). Locked, the page shows only the unlock (or
// "choose a master password") form; the vault locks again after
// `IDLE_LOCK_MS` without a key press or click, on reload, or with `L`.
// Kept away from Jarvis: not in its search, no tools, no `@` references.
function Home() {
  const keyLabel = useShortcutLabels()
  const { data } = useSuspenseQuery(passwordsTreeQueryOptions)
  const { data: vault } = useSuspenseQuery(passwordVaultQueryOptions)
  const unlocked = useUnlocked() && vault !== null
  const tree = useMemo(() => buildTree(data.folders, data.passwords), [data])

  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterTree(tree, query), [tree, query])
  const searching = query.trim().length > 0

  const { expanded, setOpen, collapseAll } = useExpandedFolders('passwords')

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const openEditor = (state: EditorState) => {
    setEditor(state)
    setEditorOpen(true)
  }

  // A password picked in the global search while locked opens once
  // unlocked; locking closes whatever was open.
  const [pendingOpen, setPendingOpen] = useState<number | null>(null)
  useEffect(() => {
    if (!unlocked) {
      setEditorOpen(false)
      return
    }
    if (pendingOpen === null) return
    openEditor({ kind: 'password', mode: 'view', passwordId: pendingOpen })
    setPendingOpen(null)
  }, [unlocked])
  // Any key press or click here keeps it unlocked.
  useEffect(() => {
    if (!unlocked) return
    window.addEventListener('keydown', touchVault, true)
    window.addEventListener('pointerdown', touchVault, true)
    return () => {
      window.removeEventListener('keydown', touchVault, true)
      window.removeEventListener('pointerdown', touchVault, true)
    }
  }, [unlocked])

  // `z` / the header button: search every app. Picks for this app land here.
  const globalSearch = useGlobalSearch({
    app: 'passwords',
    folders: data.folders,
    setFolderOpen: setOpen,
    clearSearch: () => setQuery(''),
    openItem: (id) => {
      if (unlocked) {
        openEditor({ kind: 'password', mode: 'view', passwordId: id })
      } else setPendingOpen(id)
    },
    enabled: !editorOpen && !helpOpen,
  })
  const dialogOpen = editorOpen || helpOpen || globalSearch.open

  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = () => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }
  const clipboard = useCutPassword({
    tree,
    passwords: data.passwords,
    onExpand: (id) => setOpen(id, true),
  })

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
        const password = data.passwords.find((p) => p.id === id)
        if (password) {
          openEditor({
            kind: 'password',
            mode: 'edit',
            password,
            folderId: password.folderId,
          })
        }
      }
    },
    onDelete: (kind, id) => {
      if (kind === 'folder') {
        const node = findFolder(tree, id)
        if (node) openEditor({ kind: 'delete-folder', node })
      } else {
        const password = data.passwords.find((c) => c.id === id)
        if (password) openEditor({ kind: 'delete-password', password })
      }
    },
    onNew: (folderId) => {
      if (folderId !== null) setOpen(folderId, true)
      openEditor({ kind: 'password', mode: 'edit', folderId })
    },
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onCancelCut: clipboard.cancel,
    onCopyUsername: (id) => {
      const password = data.passwords.find((p) => p.id === id)
      if (password) copyUsername(password)
    },
    onCopyPassword: (id) => {
      const password = data.passwords.find((p) => p.id === id)
      if (password) copyPassword(password)
    },
    onOpenSite: (id) => {
      const password = data.passwords.find((p) => p.id === id)
      if (password) openSite(password)
    },
    onLock: lockVault,
    enabled: !dialogOpen && unlocked,
  })
  // Disabled while a dialog is open so shortcuts don't stack editors.
  useShortcuts(
    {
      'global.search': focusSearch,
      'global.newFolder': () => openEditor({ kind: 'folder', parentId: null }),
    },
    !dialogOpen && unlocked,
  )

  const isEmpty = !tree.folders.length && !tree.passwords.length
  const noMatches = !visible.folders.length && !visible.passwords.length

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
              disabled={!unlocked}
              onClick={() => openEditor({ kind: 'folder', parentId: null })}
            >
              <FolderPlusIcon data-icon="inline-start" />
              <span className="max-lg:hidden">Folder</span>
              <ShortcutKey id="global.newFolder" className="max-lg:hidden" />
            </Button>
            <Button
              aria-label="New password"
              className={ICON_ON_PHONES}
              disabled={!unlocked}
              onClick={() =>
                openEditor({ kind: 'password', mode: 'edit', folderId: null })
              }
            >
              <PlusIcon data-icon="inline-start" />
              <span className="max-lg:hidden">Password</span>
              <ShortcutKey id="tree.new" className="max-lg:hidden" />
            </Button>
          </div>
          <ButtonGroup aria-label="Settings">
            <Button
              variant="outline"
              size="icon"
              aria-label="Search everything"
              title={`Search everything (${keyLabel('global.globalSearch')})`}
              onClick={() => globalSearch.setOpen(true)}
            >
              <SearchIcon />
            </Button>
            <ImportExportMenu tree={tree} unlocked={unlocked} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Keyboard shortcuts"
              title={`Keyboard shortcuts (${keyLabel('global.help')})`}
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

      {!unlocked ? (
        <LockScreen vault={vault} />
      ) : (
        <>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              type="search"
              aria-label="Search passwords"
              placeholder="Search passwords…"
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
                    treeRef.current?.querySelector<HTMLElement>(
                      '[data-tree-item]',
                    )
                  if (first) {
                    e.preventDefault()
                    first.focus()
                  }
                }
              }}
            />
            {!searching && (
              <InputGroupAddon align="inline-end">
                <ShortcutKey id="global.search" className="max-lg:hidden" />
              </InputGroupAddon>
            )}
          </InputGroup>

          <Separator />

          {isEmpty ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle>No passwords yet</EmptyTitle>
                <EmptyDescription>
                  Add a login, or create a folder to group them (work,
                  banking…).
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  onClick={() =>
                    openEditor({
                      kind: 'password',
                      mode: 'edit',
                      folderId: null,
                    })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Add password
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
                <PasswordTree
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
        </>
      )}

      <EditorDialogs
        tree={tree}
        passwords={data.passwords}
        state={editor}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onChange={setEditor}
        onSaved={(id) => {
          // Keep the password visible in the tree: open its folders.
          let folderId =
            data.passwords.find((p) => p.id === id)?.folderId ?? null
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
