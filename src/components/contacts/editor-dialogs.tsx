import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CopyIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  Trash2Icon,
} from 'lucide-react'

import { ReferenceText } from '@/components/reference'
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
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import type { Contact } from '@/db/schema'
import { useConfirmKey } from '@/hooks/use-confirm-key'
import {
  flattenFolders,
  folderPath,
  mapsHref,
  telHref,
} from '@/lib/contacts/tree'
import type { FolderNode, Tree } from '@/lib/contacts/tree'
import {
  contactsTreeQueryOptions,
  deleteContact,
  deleteFolder,
} from '@/server/contacts.functions'
import { ContactForm } from './contact-form'
import type { EditorState, OpenEditor } from './editor'
import { FolderForm } from './folder-form'

// `state` is kept around after closing (only `open` flips) so the dialog
// content doesn't blank out during its exit animation.
export function EditorDialogs({
  tree,
  contacts,
  state,
  open,
  onOpenChange,
  onChange,
  onSaved,
}: {
  tree: Tree
  contacts: Array<Contact>
  state: EditorState | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Switch what the dialog shows (details ⇄ edit, delete confirm). */
  onChange: OpenEditor
  /** A contact was created or saved (e.g. to reveal it in the tree). */
  onSaved: (contactId: number) => void
}) {
  const close = () => onOpenChange(false)
  const isForm = state?.kind === 'contact' || state?.kind === 'folder'
  const isDelete =
    state?.kind === 'delete-contact' || state?.kind === 'delete-folder'
  const viewed =
    state?.kind === 'contact' && state.mode === 'view'
      ? contacts.find((c) => c.id === state.contactId)
      : undefined

  return (
    <>
      <Dialog open={open && isForm} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {state?.kind === 'contact' && state.mode === 'view' && (
            <ContactView
              contact={viewed}
              path={viewed ? folderPath(tree, viewed.folderId) : []}
              onEdit={(contact) =>
                onChange({
                  kind: 'contact',
                  mode: 'edit',
                  contact,
                  folderId: contact.folderId,
                })
              }
              onDelete={(contact) =>
                onChange({ kind: 'delete-contact', contact })
              }
            />
          )}
          {state?.kind === 'contact' && state.mode === 'edit' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.contact ? 'Edit contact' : 'New contact'}
                </DialogTitle>
              </DialogHeader>
              <ContactForm
                // Fresh form state for each contact.
                key={state.contact?.id ?? 'new'}
                contact={state.contact}
                folderId={state.folderId}
                folderOptions={flattenFolders(tree)}
                onDone={(id) => {
                  onSaved(id)
                  // Editing goes back to the details; a new contact closes.
                  if (state.contact) {
                    onChange({ kind: 'contact', mode: 'view', contactId: id })
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

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${what} copied`, type: 'success' })
  } catch {
    toast.add({ title: `Couldn't copy ${what.toLowerCase()}`, type: 'error' })
  }
}

/** One detail line: a tappable value (call / email / map) and a copy button. */
function Detail({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof PhoneIcon
  label: string
  value: string
  href: string
}) {
  return (
    <div className="flex items-start gap-1">
      <Button
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start py-2 text-left whitespace-pre-wrap"
        nativeButton={false}
        render={
          <a
            href={href}
            {...(href.startsWith('http') && {
              target: '_blank',
              rel: 'noreferrer',
            })}
          />
        }
      >
        <Icon data-icon="inline-start" />
        <span className="sr-only">{label}: </span>
        <span className="min-w-0 break-words">{value}</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Copy ${label.toLowerCase()}`}
        title={`Copy ${label.toLowerCase()}`}
        onClick={() => copy(value, label)}
      >
        <CopyIcon />
      </Button>
    </div>
  )
}

function ContactView({
  contact,
  path,
  onEdit,
  onDelete,
}: {
  contact: Contact | undefined
  path: Array<string>
  onEdit: (contact: Contact) => void
  onDelete: (contact: Contact) => void
}) {
  if (!contact) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Contact not found</EmptyTitle>
          <EmptyDescription>It may have been deleted.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const hasDetails = contact.phone || contact.email || contact.address

  return (
    <div
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        if ((e.target as Element).closest('input, textarea')) return
        if (e.key === 'e' || e.key === 'r') {
          e.preventDefault()
          onEdit(contact)
        } else if (e.key === 'd' || e.key === 'Delete') {
          e.preventDefault()
          onDelete(contact)
        }
      }}
    >
      <DialogHeader className="gap-1 pr-8">
        <DialogDescription>
          {path.length ? path.join(' / ') : 'Top level'}
        </DialogDescription>
        <DialogTitle className="text-xl leading-tight font-semibold">
          {contact.name}
        </DialogTitle>
        {contact.knownFrom && (
          <p className="text-sm text-muted-foreground">
            Known from {contact.knownFrom}
          </p>
        )}
      </DialogHeader>

      {hasDetails ? (
        <div className="-mx-2.5 flex flex-col">
          {contact.phone && (
            <Detail
              icon={PhoneIcon}
              label="Phone"
              value={contact.phone}
              href={telHref(contact.phone)}
            />
          )}
          {contact.email && (
            <Detail
              icon={MailIcon}
              label="Email"
              value={contact.email}
              href={`mailto:${contact.email}`}
            />
          )}
          {contact.address && (
            <Detail
              icon={MapPinIcon}
              label="Address"
              value={contact.address}
              href={mapsHref(contact.address)}
            />
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">
          No phone, email or address yet. Press <Kbd>e</Kbd> to add them.
        </p>
      )}

      {contact.description.trim() && (
        <p className="break-words whitespace-pre-wrap">
          <ReferenceText>{contact.description}</ReferenceText>
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onDelete(contact)}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
        {/* Focused on open so e / d / Esc work straight away. */}
        <Button autoFocus onClick={() => onEdit(contact)}>
          <PencilIcon data-icon="inline-start" />
          Edit
          <Kbd className="max-sm:hidden">E</Kbd>
        </Button>
      </DialogFooter>
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
  state: Extract<EditorState, { kind: 'delete-contact' | 'delete-folder' }>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () =>
      state.kind === 'delete-contact'
        ? deleteContact({ data: { id: state.contact.id } })
        : deleteFolder({ data: { id: state.node.folder.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(contactsTreeQueryOptions)
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
  useConfirmKey('d', () => {
    if (!remove.isPending) remove.mutate()
  })

  let title: string
  let description: string
  if (state.kind === 'delete-contact') {
    title = `Delete “${state.contact.name}”?`
    description = 'This can’t be undone.'
  } else {
    const subfolders = countFolders(state.node)
    const contacts = state.node.contactCount
    title = `Delete “${state.node.folder.name}”?`
    description =
      subfolders || contacts
        ? `This also deletes ${[
            subfolders && plural(subfolders, 'subfolder'),
            contacts && plural(contacts, 'contact'),
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
          <Kbd className="max-sm:hidden">d</Kbd>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
