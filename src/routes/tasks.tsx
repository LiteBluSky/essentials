import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  CalendarDaysIcon,
  CalendarIcon,
  CircleCheckBigIcon,
  CircleIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  KeyboardIcon,
  ListChecksIcon,
  ListIcon,
  PartyPopperIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { CalendarDialog } from '@/components/tasks/calendar-dialog'
import type { EditorState } from '@/components/tasks/editor'
import { EditorDialogs } from '@/components/tasks/editor-dialogs'
import { ImportExportMenu } from '@/components/tasks/import-export-menu'
import { ShortcutsDialog } from '@/components/tasks/shortcuts-dialog'
import { TaskList, TaskTree } from '@/components/tasks/task-tree'
import { TreeDndProvider } from '@/components/tasks/tree-dnd'
import { UpNext } from '@/components/tasks/up-next'
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
import { useCompleteTask } from '@/hooks/tasks/use-complete-task'
import { useCutTask } from '@/hooks/tasks/use-cut-task'
import { useHydrated } from '@/hooks/use-hydrated'
import { useTaskView } from '@/hooks/tasks/use-task-view'
import { useTreeKeyboard } from '@/hooks/tasks/use-tree-keyboard'
import { useAppSwitch } from '@/hooks/use-app-switch'
import { useExpandedFolders } from '@/hooks/use-expanded-folders'
import { useGlobalSearch } from '@/hooks/use-global-search'
import { APP_NAME } from '@/lib/config'
import { MOD_LABEL, SHORTCUTS, useShortcuts } from '@/lib/shortcuts'
import type { ShortcutName } from '@/lib/shortcuts'
import type { TaskInput } from '@/lib/tasks/schemas'
import {
  buildTree,
  filterDay,
  filterStatus,
  filterTree,
  findFolder,
  flatTasks,
  folderPath,
  todayName,
  UP_NEXT_KEYS,
  upNext,
} from '@/lib/tasks/tree'
import { databasesQueryOptions } from '@/server/databases.functions'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import { tasksTreeQueryOptions } from '@/server/tasks.functions'

export const Route = createFileRoute('/tasks')({
  // `?day=YYYY-MM-DD` (from the Calendar's `o`): open filtered to that day.
  validateSearch: z.object({
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .catch(undefined),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(tasksTreeQueryOptions),
      context.queryClient.ensureQueryData(assistantEnabledQueryOptions),
      context.queryClient.ensureQueryData(databasesQueryOptions),
    ]),
  head: () => ({ meta: [{ title: `Tasks · ${APP_NAME}` }] }),
  component: Home,
})

function Home() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(tasksTreeQueryOptions)
  const tree = useMemo(() => buildTree(data.folders, data.tasks), [data])

  // `t`: open / completed tasks; `v`: in folders / one flat list.
  const { view, setStatus, setLayout, toggleStatus, toggleLayout } =
    useTaskView()
  const shown = useMemo(
    () => filterStatus(tree, view.status),
    [tree, view.status],
  )

  // A day picked in the calendar (`YYYY-MM-DD`): only tasks dated that day.
  // Also given as `?day=` (Calendar app), then dropped from the URL so the
  // chip / `q` clears it as usual.
  const search = Route.useSearch()
  const navigateTasks = useNavigate({ from: '/tasks' })
  const [day, setDay] = useState<string | null>(search.day ?? null)
  useEffect(() => {
    if (!search.day) return
    setDay(search.day)
    void navigateTasks({ search: {}, replace: true })
  }, [search.day, navigateTasks])
  const dated = useMemo(
    () => (day ? filterDay(shown, day) : shown),
    [shown, day],
  )
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterTree(dated, query), [dated, query])
  const searching = query.trim().length > 0
  // Any filter on (search or day): folders forced open, no drag and drop.
  const filtering = searching || day !== null
  const flat = useMemo(
    () => (view.layout === 'list' ? flatTasks(visible, view.status) : []),
    [visible, view],
  )
  // Dated in the browser's timezone, so only once hydrated.
  const hydrated = useHydrated()
  const next = useMemo(
    () => (hydrated ? upNext(data.tasks) : null),
    [hydrated, data.tasks],
  )
  const complete = useCompleteTask()

  const { expanded, setOpen, collapseAll } = useExpandedFolders('tasks')

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const openEditor = (state: EditorState) => {
    setEditor(state)
    setEditorOpen(true)
  }
  // New tasks go to the top level unless a folder is given, not due unless a
  // day is given (from the calendar).
  const newTask = (folderId: TaskInput['folderId'] = null, date?: Date) => {
    if (typeof folderId === 'number') setOpen(folderId, true)
    openEditor({ kind: 'task', mode: 'edit', folderId, date })
  }
  // After saving, open the folders leading to the task so it's on screen.
  const revealTask = (id: number) => {
    const latest = queryClient.getQueryData(tasksTreeQueryOptions.queryKey)
    let folderId = latest?.tasks.find((t) => t.id === id)?.folderId ?? null
    while (folderId !== null) {
      setOpen(folderId, true)
      const current: number = folderId
      folderId = latest?.folders.find((f) => f.id === current)?.parentId ?? null
    }
  }

  // `z` / the header button: search every app. Picks for this app land here.
  const globalSearch = useGlobalSearch({
    app: 'tasks',
    folders: data.folders,
    setFolderOpen: setOpen,
    clearSearch: () => {
      setQuery('')
      setDay(null)
      setLayout('folders')
    },
    openItem: (id) => openEditor({ kind: 'task', mode: 'view', taskId: id }),
    enabled: !editorOpen && !helpOpen && !calendarOpen,
  })
  const dialogOpen = editorOpen || helpOpen || calendarOpen || globalSearch.open

  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = () => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }
  const clipboard = useCutTask({
    tree,
    tasks: data.tasks,
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
      if (!filtering) return false
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
      setDay(null)
      return true
    },
    onHelp: () => setHelpOpen(true),
    onEdit: (kind, id) => {
      if (kind === 'folder') {
        const folder = data.folders.find((f) => f.id === id)
        if (folder) openEditor({ kind, folder, parentId: folder.parentId })
      } else {
        const task = data.tasks.find((t) => t.id === id)
        if (task) {
          openEditor({ kind, mode: 'edit', task, folderId: task.folderId })
        }
      }
    },
    onDelete: (kind, id) => {
      if (kind === 'folder') {
        const node = findFolder(tree, id)
        if (node) openEditor({ kind: 'delete-folder', node })
      } else {
        const task = data.tasks.find((t) => t.id === id)
        if (task) openEditor({ kind: 'delete-task', task })
      }
    },
    onNew: newTask,
    onComplete: complete,
    onToggleDone: toggleStatus,
    onToggleLayout: toggleLayout,
    onCut: clipboard.cut,
    onPaste: clipboard.paste,
    onCancelCut: clipboard.cancel,
    onOpenUpNext: (index) => {
      const task = index < UP_NEXT_KEYS ? next?.tasks.at(index) : undefined
      if (task) openEditor({ kind: 'task', mode: 'view', taskId: task.id })
    },
    onCalendar: () => setCalendarOpen(true),
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

  const isEmpty = !tree.folders.length && !tree.tasks.length
  const noneShown =
    view.layout === 'list'
      ? !flat.length
      : !visible.folders.length && !visible.tasks.length
  const pathOf = (folderId: number | null) =>
    folderPath(tree, folderId).join(' / ')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-8">
      {/* On phones the actions drop under the app select, spread across. */}
      <header className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
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
              aria-label="New task"
              className={ICON_ON_PHONES}
              onClick={() => newTask()}
            >
              <PlusIcon data-icon="inline-start" />
              <span className="max-sm:hidden">Task</span>
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
            <Button
              variant="outline"
              size="icon"
              aria-label="Calendar"
              title="Calendar (i)"
              onClick={() => setCalendarOpen(true)}
            >
              <CalendarDaysIcon />
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
        shown={shown}
        enabled={false}
        onExpand={(id) => setOpen(id, true)}
      >
        <UpNext next={next} onEdit={openEditor} onComplete={complete} />
      </TreeDndProvider>

      <div className="flex flex-wrap gap-2">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks…"
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
              <ShortcutHint name="search" />
            </InputGroupAddon>
          )}
        </InputGroup>
        {day && (
          <Button
            variant="secondary"
            title="Clear the date filter (q)"
            aria-label={`Showing tasks dated ${day}. Clear the date filter`}
            onClick={() => setDay(null)}
          >
            <CalendarIcon data-icon="inline-start" />
            {format(parseISO(day), 'd MMM yyyy')}
            <Kbd className="max-sm:hidden">q</Kbd>
            <XIcon data-icon="inline-end" />
          </Button>
        )}
        <div className="flex gap-2 max-sm:w-full max-sm:justify-between">
          <ButtonGroup aria-label="Which tasks">
            <ViewButton
              active={view.status === 'open'}
              onClick={() => setStatus('open')}
              title="Open tasks (t)"
            >
              <CircleIcon data-icon="inline-start" />
              Open
            </ViewButton>
            <ViewButton
              active={view.status === 'done'}
              onClick={() => setStatus('done')}
              title="Completed tasks (t)"
            >
              <CircleCheckBigIcon data-icon="inline-start" />
              Done
            </ViewButton>
          </ButtonGroup>
          <ButtonGroup aria-label="Layout">
            <ViewButton
              active={view.layout === 'folders'}
              onClick={() => setLayout('folders')}
              title="Group in folders (v)"
              aria-label="Folders"
            >
              <FolderTreeIcon />
            </ViewButton>
            <ViewButton
              active={view.layout === 'list'}
              onClick={() => setLayout('list')}
              title="One list, oldest first (v)"
              aria-label="List"
            >
              <ListIcon />
            </ViewButton>
          </ButtonGroup>
        </div>
      </div>

      <Separator />

      {isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>
              Press <Kbd>a</Kbd> to add one.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => newTask()}>
              <PlusIcon data-icon="inline-start" />
              New task
            </Button>
          </EmptyContent>
        </Empty>
      ) : filtering && noneShown ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              Nothing {view.status === 'done' ? 'completed' : 'open'}
              {day && ` dated ${format(parseISO(day), 'd MMM yyyy')}`}
              {searching && ` matches “${query.trim()}”`}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : noneShown ? (
        view.status === 'done' ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheckBigIcon />
              </EmptyMedia>
              <EmptyTitle>Nothing completed yet</EmptyTitle>
              <EmptyDescription>
                Tick a task off and it shows up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PartyPopperIcon />
              </EmptyMedia>
              <EmptyTitle>All done</EmptyTitle>
              <EmptyDescription>No open tasks left.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <div ref={treeRef}>
          <TreeDndProvider
            tree={tree}
            shown={shown}
            enabled={
              !filtering && view.layout === 'folders' && view.status === 'open'
            }
            onExpand={(id) => setOpen(id, true)}
          >
            {view.layout === 'folders' ? (
              <TaskTree
                tree={visible}
                expanded={expanded}
                forceOpen={filtering}
                onToggle={setOpen}
                onEdit={openEditor}
                onComplete={complete}
                cutId={clipboard.cutId}
              />
            ) : (
              <TaskList
                tasks={flat}
                pathOf={pathOf}
                onEdit={openEditor}
                onComplete={complete}
                cutId={clipboard.cutId}
              />
            )}
          </TreeDndProvider>
        </div>
      )}

      <EditorDialogs
        tree={tree}
        tasks={data.tasks}
        state={editor}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onChange={openEditor}
        onComplete={complete}
        onSaved={revealTask}
      />
      <GlobalSearch
        open={globalSearch.open}
        onOpenChange={globalSearch.setOpen}
      />
      <CalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        tasks={data.tasks}
        selected={day ? parseISO(day) : undefined}
        onNewTask={(date) => newTask(null, date)}
        onShowDay={(date) => setDay(todayName(date))}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <AppFooter />
    </main>
  )
}

function ViewButton({
  active,
  ...props
}: React.ComponentProps<typeof Button> & { active: boolean }) {
  return (
    <Button
      variant={active ? 'secondary' : 'outline'}
      aria-pressed={active}
      {...props}
    />
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
