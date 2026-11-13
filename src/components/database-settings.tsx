import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CloudIcon,
  CopyIcon,
  HardDriveIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { databaseInput } from '@/lib/databases'
import type { DatabaseInput, DatabaseView } from '@/lib/databases'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import {
  copyDatabase,
  createDatabase,
  databasesQueryOptions,
  deleteDatabase,
  editDatabase,
  switchDatabase,
} from '@/server/databases.functions'

/**
 * Settings → Database: which database the data comes from — the local file
 * (as always) or a remote libSQL one such as Turso, one entry per database.
 * Switching reloads the page; nothing is copied between them.
 */
export function DatabaseSettings() {
  const query = useQuery(databasesQueryOptions)
  const view = query.data
  const queryClient = useQueryClient()
  // The form below the list: a new database, or the one being edited.
  const [editing, setEditing] = useState<DatabaseView | 'new' | null>(null)

  const switchTo = useMutation({
    mutationFn: (id: number | null) => switchDatabase({ data: { id } }),
    // Every app's data changed: start over from the server.
    onSuccess: () => window.location.reload(),
    onError: (error) =>
      toast.add({
        title: "Couldn't switch database",
        description: error.message,
        type: 'error',
      }),
  })

  // The database to copy from, once its Copy button is pressed.
  const [copyFrom, setCopyFrom] = useState<{
    id: number | null
    name: string
  } | null>(null)
  const copy = useMutation({
    mutationFn: (id: number | null) => copyDatabase({ data: { id } }),
    // Every app's data changed: start over from the server.
    onSuccess: () => window.location.reload(),
    onError: (error) => {
      setCopyFrom(null)
      toast.add({
        title: "Couldn't copy the data",
        description: error.message,
        type: 'error',
      })
    },
  })
  const activeName =
    view?.databases.find((d) => d.id === view.activeId)?.name ?? 'Local'

  const remove = useMutation({
    mutationFn: (id: number) => deleteDatabase({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries(databasesQueryOptions),
    onError: (error) =>
      toast.add({
        title: "Couldn't remove it",
        description: error.message,
        type: 'error',
      }),
  })

  return (
    <FieldSet className="min-w-0">
      <FieldLegend>Database</FieldLegend>
      <FieldDescription>
        Where your bookmarks, notes, tasks and everything else are kept: the
        file on this server, or a Turso database (turso.tech, free tier) or any
        libSQL server. Each holds its own data; switching copies nothing (use
        each app’s export / import). Settings stay on this server.
      </FieldDescription>
      {view?.startupError && (
        <p className="text-sm text-destructive">
          {`Couldn’t reach “${view.startupError.name}” when the server started (${view.startupError.message}), so the local file is in use. Pick it again to retry.`}
        </p>
      )}
      {view ? (
        <ItemGroup className="gap-2">
          <DatabaseRow
            icon={<HardDriveIcon />}
            name="Local"
            detail={view.localPath}
            active={view.activeId === null}
            pending={switchTo.isPending && switchTo.variables === null}
            disabled={switchTo.isPending}
            onUse={() => switchTo.mutate(null)}
            onCopy={() => setCopyFrom({ id: null, name: 'Local' })}
          />
          {view.databases.map((database) => (
            <DatabaseRow
              key={database.id}
              icon={<CloudIcon />}
              name={database.name}
              detail={
                database.tokenHint
                  ? `${database.url} · token •••• ${database.tokenHint}`
                  : database.url
              }
              active={view.activeId === database.id}
              pending={switchTo.isPending && switchTo.variables === database.id}
              disabled={switchTo.isPending}
              onUse={() => switchTo.mutate(database.id)}
              onCopy={() =>
                setCopyFrom({ id: database.id, name: database.name })
              }
              onEdit={() => setEditing(database)}
              onRemove={() => remove.mutate(database.id)}
            />
          ))}
        </ItemGroup>
      ) : query.error ? (
        <p className="text-sm text-destructive">{query.error.message}</p>
      ) : (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {editing ? (
        <DatabaseForm
          // Fresh form state per database.
          key={editing === 'new' ? 'new' : editing.id}
          database={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing('new')}
          >
            <PlusIcon data-icon="inline-start" />
            Add Turso database
          </Button>
        </div>
      )}
      <AlertDialog
        open={copyFrom !== null}
        onOpenChange={(open) => {
          if (!open && !copy.isPending) setCopyFrom(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Copy “{copyFrom?.name}” into “{activeName}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Everything in “{activeName}” (bookmarks, notes, tasks, contacts,
              calendar, chats and the assistant history) is replaced with a copy
              of “{copyFrom?.name}”. “{copyFrom?.name}” stays as it is. This
              can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copy.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={copy.isPending}
              onClick={() => copyFrom && copy.mutate(copyFrom.id)}
            >
              {copy.isPending && <Spinner data-icon="inline-start" />}
              Replace and copy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FieldSet>
  )
}

function DatabaseRow({
  icon,
  name,
  detail,
  active,
  pending,
  disabled,
  onUse,
  onCopy,
  onEdit,
  onRemove,
}: {
  icon: React.ReactNode
  name: string
  detail: string
  active: boolean
  pending: boolean
  disabled: boolean
  onUse: () => void
  onCopy: () => void
  onEdit?: () => void
  onRemove?: () => void
}) {
  return (
    <Item variant="outline" size="sm">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{name}</ItemTitle>
        <ItemDescription className="truncate" title={detail}>
          {detail}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {active ? (
          <Badge variant="secondary">In use</Badge>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onUse}
          >
            {pending && <Spinner data-icon="inline-start" />}
            Use
          </Button>
        )}
        {!active && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Copy ${name}'s data into the database in use`}
            title="Copy its data into the database in use (replaces it)"
            disabled={disabled}
            onClick={onCopy}
          >
            <CopyIcon />
          </Button>
        )}
        {onEdit && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Edit ${name}`}
            title="Edit"
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
        )}
        {onRemove && !active && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${name}`}
            title="Remove (its data stays in Turso)"
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        )}
      </ItemActions>
    </Item>
  )
}

const FIELDS: Array<{
  name: keyof DatabaseInput
  label: string
  placeholder: string
  description?: string
}> = [
  { name: 'name', label: 'Name', placeholder: 'Personal' },
  {
    name: 'url',
    label: 'Database URL',
    placeholder: 'libsql://personal-myname.turso.io',
    description: 'turso db show <name> --url',
  },
  {
    name: 'authToken',
    label: 'Auth token',
    placeholder: 'eyJhbGciOi…',
    description:
      'turso db tokens create <name> (a group token works for several databases). Empty for a server without auth.',
  },
]

/** Add a database, or edit one (`database`): its token is never shown, so
 * an empty token field keeps it (✕ removes it). */
function DatabaseForm({
  database,
  onDone,
}: {
  database: DatabaseView | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  // Edit: the saved token is to be removed.
  const [clearToken, setClearToken] = useState(false)
  const save = useMutation({
    mutationFn: (data: DatabaseInput) =>
      database
        ? editDatabase({ data: { ...data, id: database.id, clearToken } })
        : createDatabase({ data }).then(() => ({ reload: false })),
    onSuccess: async ({ reload }) => {
      // The one in use got a new connection: every app's data may differ.
      if (reload) return window.location.reload()
      await queryClient.invalidateQueries(databasesQueryOptions)
      toast.add({
        title: database ? 'Database saved' : 'Database added',
        description: database ? undefined : 'Press Use to switch to it.',
        type: 'success',
      })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: database ? "Couldn't save it" : "Couldn't add it",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      name: database?.name ?? '',
      url: database?.url ?? '',
      authToken: '',
    },
    validators: { onSubmit: databaseInput },
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
  })

  const tokenHint = clearToken ? null : (database?.tokenHint ?? null)

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
      onKeyDownCapture={submitOnModEnter(() => void form.handleSubmit())}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        {FIELDS.map((spec) => (
          <form.Field
            key={spec.name}
            name={spec.name}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              const id = `database-${spec.name}`
              const isToken = spec.name === 'authToken'
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
                  {isToken ? (
                    <InputGroup>
                      <InputGroupInput
                        id={id}
                        type="password"
                        autoComplete="new-password"
                        placeholder={
                          tokenHint
                            ? `•••• ${tokenHint} (saved, type to replace)`
                            : spec.placeholder
                        }
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(e.target.value)
                          setClearToken(false)
                        }}
                        aria-invalid={isInvalid}
                      />
                      {tokenHint && (
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            size="icon-xs"
                            aria-label="Remove the saved token"
                            title="Remove"
                            onClick={() => {
                              field.handleChange('')
                              setClearToken(true)
                            }}
                          >
                            <XIcon />
                          </InputGroupButton>
                        </InputGroupAddon>
                      )}
                    </InputGroup>
                  ) : (
                    <Input
                      id={id}
                      autoComplete="off"
                      autoFocus={spec.name === 'name'}
                      placeholder={spec.placeholder}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />
                  )}
                  {isToken && clearToken ? (
                    <FieldDescription>Removed when you save.</FieldDescription>
                  ) : (
                    spec.description && (
                      <FieldDescription>{spec.description}</FieldDescription>
                    )
                  )}
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        ))}
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {isSubmitting ? 'Connecting…' : database ? 'Save' : 'Add'}
            </Button>
          )}
        />
      </div>
    </form>
  )
}
