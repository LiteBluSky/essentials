import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudIcon, HardDriveIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

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
import type { DatabaseInput } from '@/lib/databases'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import {
  createDatabase,
  databasesQueryOptions,
  deleteDatabase,
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
  const [adding, setAdding] = useState(false)

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
    <FieldSet>
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
      {adding ? (
        <AddDatabaseForm onDone={() => setAdding(false)} />
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
          >
            <PlusIcon data-icon="inline-start" />
            Add Turso database
          </Button>
        </div>
      )}
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
  onRemove,
}: {
  icon: React.ReactNode
  name: string
  detail: string
  active: boolean
  pending: boolean
  disabled: boolean
  onUse: () => void
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

function AddDatabaseForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const add = useMutation({
    mutationFn: (data: DatabaseInput) => createDatabase({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries(databasesQueryOptions)
      toast.add({
        title: 'Database added',
        description: 'Press Use to switch to it.',
        type: 'success',
      })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't add it",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: { name: '', url: '', authToken: '' },
    validators: { onSubmit: databaseInput },
    onSubmit: ({ value }) => add.mutateAsync(value).catch(() => {}),
  })

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
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
                  <Input
                    id={id}
                    type={spec.name === 'authToken' ? 'password' : 'text'}
                    autoComplete={
                      spec.name === 'authToken' ? 'new-password' : 'off'
                    }
                    autoFocus={spec.name === 'name'}
                    placeholder={spec.placeholder}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {spec.description && (
                    <FieldDescription>{spec.description}</FieldDescription>
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
              {isSubmitting ? 'Connecting…' : 'Add'}
            </Button>
          )}
        />
      </div>
    </form>
  )
}
