import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookmarkIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyRoundIcon,
  PencilIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import type { Password } from '@/db/schema'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import {
  flattenFolders,
  folderPath,
  siteBookmark,
  siteHref,
} from '@/lib/passwords/tree'
import type { FolderNode, Tree } from '@/lib/passwords/tree'
import { openSecret } from '@/lib/passwords/vault'
import { cn } from '@/lib/utils'
import {
  deleteFolder,
  deletePassword,
  passwordsTreeQueryOptions,
} from '@/server/passwords.functions'
import { isShortcut, shortcutKey, useShortcutLabels } from '@/lib/shortcuts'
import type { ShortcutId } from '@/lib/shortcuts'
import { ShortcutKey } from '@/components/shortcut-key'
import { PasswordForm } from './password-form'
import type { EditorState, OpenEditor } from './editor'
import { FolderForm } from './folder-form'
import { copyPassword, copySite, copyUsername, useOpenSite } from './actions'
import { Hint } from '@/components/hint'

// `state` is kept around after closing (only `open` flips) so the dialog
// content doesn't blank out during its exit animation.
export function EditorDialogs({
  tree,
  passwords,
  state,
  open,
  onOpenChange,
  onChange,
  onSaved,
}: {
  tree: Tree
  passwords: Array<Password>
  state: EditorState | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Switch what the dialog shows (details ⇄ edit, delete confirm). */
  onChange: OpenEditor
  /** A password was created or saved (e.g. to reveal it in the tree). */
  onSaved: (passwordId: number) => void
}) {
  const close = () => onOpenChange(false)
  const isForm = state?.kind === 'password' || state?.kind === 'folder'
  const isDelete =
    state?.kind === 'delete-password' || state?.kind === 'delete-folder'
  const viewed =
    state?.kind === 'password' && state.mode === 'view'
      ? passwords.find((p) => p.id === state.passwordId)
      : undefined

  return (
    <>
      <Dialog open={open && isForm} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {state?.kind === 'password' && state.mode === 'view' && (
            <PasswordView
              // Hidden again for each password.
              key={state.passwordId}
              password={viewed}
              path={viewed ? folderPath(tree, viewed.folderId) : []}
              onEdit={(password) =>
                onChange({
                  kind: 'password',
                  mode: 'edit',
                  password,
                  folderId: password.folderId,
                })
              }
              onDelete={(password) =>
                onChange({ kind: 'delete-password', password })
              }
            />
          )}
          {state?.kind === 'password' && state.mode === 'edit' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.password ? 'Edit password' : 'New password'}
                </DialogTitle>
              </DialogHeader>
              <PasswordForm
                // Fresh form state for each password.
                key={state.password?.id ?? 'new'}
                password={state.password}
                folderId={state.folderId}
                folderOptions={flattenFolders(tree)}
                onDone={(id) => {
                  onSaved(id)
                  // Editing goes back to the details; a new password closes.
                  if (state.password) {
                    onChange({ kind: 'password', mode: 'view', passwordId: id })
                  } else close()
                }}
              />
            </>
          )}
          {state?.kind === 'folder' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.folder ? 'Edit folder' : 'New folder'}
                </DialogTitle>
              </DialogHeader>
              <FolderForm
                folder={state.folder}
                parentId={state.parentId}
                folderOptions={flattenFolders(tree, state.folder?.id)}
                onDone={close}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={open && isDelete} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {isDelete && <DeleteConfirm state={state} onDone={close} />}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * A password's details: username, the password (hidden until `v` or the
 * eye), the website, the notes. `u` / `c` copy the username / password, `O`
 * opens the site, `e` edits, `d` deletes. The secret is opened while this
 * shows and never kept.
 */
function PasswordView({
  password,
  path,
  onEdit,
  onDelete,
}: {
  password: Password | undefined
  path: Array<string>
  onEdit: (password: Password) => void
  onDelete: (password: Password) => void
}) {
  const keyLabel = useShortcutLabels()
  const openSite = useOpenSite()
  const [revealed, setRevealed] = useState(false)
  const sealed = password?.secret
  const secret = useMemo(() => {
    if (!sealed) return null
    try {
      return openSecret(sealed)
    } catch {
      return null
    }
  }, [sealed])

  if (!password) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Password not found</EmptyTitle>
          <EmptyDescription>It may have been deleted.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const href = siteHref(password.url)
  const bookmark = siteBookmark(password.url)

  return (
    <div
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        if ((e.target as Element).closest('input, textarea')) return
        const act = (fn: () => void) => {
          e.preventDefault()
          fn()
        }
        if (isShortcut(e, 'passwords.copyUsername')) {
          act(() => copyUsername(password))
        } else if (isShortcut(e, 'passwords.copyPassword')) {
          act(() => copyPassword(password))
        } else if (isShortcut(e, 'passwords.reveal')) {
          act(() => setRevealed((r) => !r))
        } else if (isShortcut(e, 'passwords.openSite')) {
          act(() => openSite(password))
        } else {
          // The keys can be changed: `key` is the shortcut's default key.
          const key = shortcutKey(e, ['viewer'])
          if (key === 'e') act(() => onEdit(password))
          else if (key === 'd' || key === 'Delete') {
            act(() => onDelete(password))
          }
        }
      }}
    >
      <DialogHeader className="gap-1 pr-8">
        <DialogDescription>
          {path.length ? path.join(' / ') : 'Top level'}
        </DialogDescription>
        <DialogTitle className="text-xl leading-tight font-semibold">
          {password.name}
        </DialogTitle>
      </DialogHeader>

      <div className="-mx-2.5 flex flex-col">
        <Detail
          icon={UserIcon}
          label="Username"
          value={password.username}
          copyId="passwords.copyUsername"
          onCopy={() => copyUsername(password)}
        />
        <Detail
          icon={KeyRoundIcon}
          label="Password"
          value={
            secret === null
              ? 'Can’t be opened with this key'
              : revealed
                ? secret.password
                : secret.password && '•'.repeat(12)
          }
          mono={revealed}
          copyId="passwords.copyPassword"
          onCopy={() => copyPassword(password)}
          extra={
            <Hint
              label={`${revealed ? 'Hide' : 'Show'} (${keyLabel('passwords.reveal')})`}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  revealed ? 'Hide the password' : 'Show the password'
                }
                aria-pressed={revealed}
                onClick={() => setRevealed((r) => !r)}
              >
                {revealed ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </Hint>
          }
        />
        {password.url && (
          <Detail
            icon={bookmark ? BookmarkIcon : GlobeIcon}
            label="Website"
            // A bookmark: its name; a click opens its current URL.
            value={bookmark ? `@${bookmark.name}` : password.url}
            href={href ?? undefined}
            onOpen={bookmark ? () => openSite(password) : undefined}
            copyId={null}
            onCopy={() => void copySite(password)}
          />
        )}
      </div>

      {secret?.notes.trim() && (
        <p className="break-words whitespace-pre-wrap">{secret.notes}</p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onDelete(password)}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
        {/* Focused on open so the keys work straight away. */}
        <Button autoFocus onClick={() => onEdit(password)}>
          <PencilIcon data-icon="inline-start" />
          Edit
          <ShortcutKey id="viewer.edit" className="max-lg:hidden" />
        </Button>
      </DialogFooter>
    </div>
  )
}

/** One detail line: the value (a link for the website, else a click
 * copies it) and a copy button. */
function Detail({
  icon: Icon,
  label,
  value,
  href,
  mono = false,
  copyId,
  onCopy,
  onOpen,
  extra,
}: {
  icon: typeof UserIcon
  label: string
  value: string
  href?: string
  mono?: boolean
  /** The copy shortcut, for its hint. */
  copyId: ShortcutId | null
  onCopy: () => void
  /** What a click on the value does when it isn't a link (else it copies). */
  onOpen?: () => void
  extra?: React.ReactNode
}) {
  const keyLabel = useShortcutLabels()
  const content = (
    <>
      <Icon data-icon="inline-start" />
      <span className="sr-only">{label}: </span>
      <span
        className={cn(
          'min-w-0 break-all',
          mono && 'font-mono',
          !value && 'text-muted-foreground',
        )}
      >
        {value || `No ${label.toLowerCase()}`}
      </span>
    </>
  )
  const rowClass =
    'h-auto min-w-0 flex-1 justify-start py-2 text-left whitespace-pre-wrap'
  return (
    <div className="flex items-start gap-1">
      {href ? (
        <Button
          variant="ghost"
          className={rowClass}
          nativeButton={false}
          render={<a href={href} target="_blank" rel="noreferrer" />}
        >
          {content}
        </Button>
      ) : (
        <Button
          variant="ghost"
          className={rowClass}
          disabled={!value}
          onClick={onOpen ?? onCopy}
        >
          {content}
        </Button>
      )}
      {extra}
      <Hint
        label={`Copy ${label.toLowerCase()}${copyId ? ` (${keyLabel(copyId)})` : ''}`}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          disabled={!value}
          onClick={onCopy}
        >
          <CopyIcon />
        </Button>
      </Hint>
    </div>
  )
}

function countFolders(node: FolderNode): number {
  return node.folders.reduce((n, f) => n + 1 + countFolders(f), 0)
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function DeleteConfirm({
  state,
  onDone,
}: {
  state: Extract<EditorState, { kind: 'delete-password' | 'delete-folder' }>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () =>
      state.kind === 'delete-password'
        ? deletePassword({ data: { id: state.password.id } })
        : deleteFolder({ data: { id: state.node.folder.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(passwordsTreeQueryOptions)
      toast.add({ title: 'Deleted', type: 'success' })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't delete",
        description: error.message,
        type: 'error',
      }),
  })
  useConfirmKey(() => {
    if (!remove.isPending) remove.mutate()
  })

  let title: string
  let description: string
  if (state.kind === 'delete-password') {
    title = `Delete “${state.password.name}”?`
    description = 'The saved password is gone for good. This can’t be undone.'
  } else {
    const subfolders = countFolders(state.node)
    const passwords = state.node.passwordCount
    title = `Delete “${state.node.folder.name}”?`
    description =
      subfolders || passwords
        ? `This also deletes ${[
            subfolders && plural(subfolders, 'subfolder'),
            passwords && plural(passwords, 'password'),
          ]
            .filter(Boolean)
            .join(' and ')} inside it. This can’t be undone.`
        : 'The folder is empty.'
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending && <Spinner data-icon="inline-start" />}
          Delete
          <ShortcutKey id="global.confirm" className="max-lg:hidden" />
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
