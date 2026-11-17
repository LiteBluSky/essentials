import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LockIcon, LockOpenIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import type { VaultRow } from '@/lib/passwords/vault'
import {
  createVault,
  lockVault,
  rekeyVault,
  unlockVault,
} from '@/lib/passwords/vault'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import {
  changeMasterPassword,
  createVault as saveVault,
  getTree,
  passwordVaultQueryOptions,
  passwordsTreeQueryOptions,
} from '@/server/passwords.functions'

const MIN_MASTER = 8

const newMaster = z
  .object({
    master: z
      .string()
      .min(MIN_MASTER, `At least ${MIN_MASTER} characters (longer is better)`)
      .max(1000),
    repeat: z.string(),
  })
  .refine((v) => v.master === v.repeat, {
    message: 'The two don’t match',
    path: ['repeat'],
  })
type NewMaster = z.infer<typeof newMaster>

const unlockInput = z.object({
  master: z.string().min(1, 'Type your master password'),
})

/** One password field of these forms. */
function MasterField({
  field,
  label,
  autoFocus = false,
  autoComplete,
  error,
}: {
  field: {
    name: string
    state: {
      value: string
      meta: { isTouched: boolean; isValid: boolean; errors: Array<unknown> }
    }
    handleBlur: () => void
    handleChange: (value: string) => void
  }
  label: string
  autoFocus?: boolean
  autoComplete: string
  /** An error found after submitting (a wrong master password). */
  error?: string
}) {
  const isInvalid =
    !!error || (field.state.meta.isTouched && !field.state.meta.isValid)
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type="password"
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={isInvalid}
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        isInvalid && (
          <FieldError
            errors={field.state.meta.errors as Array<{ message?: string }>}
          />
        )
      )}
    </Field>
  )
}

/**
 * What the Passwords page shows while the vault is locked: set a master
 * password the first time, else unlock with it. Enter submits.
 */
export function LockScreen({ vault }: { vault: VaultRow | null }) {
  return vault ? <Unlock vault={vault} /> : <CreateVault />
}

function Unlock({ vault }: { vault: VaultRow }) {
  const [wrong, setWrong] = useState(false)
  const form = useForm({
    defaultValues: { master: '' },
    validators: { onSubmit: unlockInput },
    onSubmit: async ({ value, formApi }) => {
      setWrong(false)
      if (!(await unlockVault(value.master, vault))) {
        setWrong(true)
        formApi.setFieldValue('master', '')
      }
    },
  })

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle>Passwords are locked</EmptyTitle>
        <EmptyDescription>
          Unlock with your master password. It locks again after 15 minutes
          without use, on reload, or with Lock.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form
          noValidate
          className="flex w-full max-w-sm flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field
            name="master"
            children={(field) => (
              <MasterField
                field={field}
                label="Master password"
                autoFocus
                autoComplete="current-password"
                error={wrong ? 'That’s not the master password.' : undefined}
              />
            )}
          />
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <LockOpenIcon data-icon="inline-start" />
                )}
                Unlock
              </Button>
            )}
          />
        </form>
      </EmptyContent>
    </Empty>
  )
}

function CreateVault() {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async ({ master }: NewMaster) => {
      const row = await createVault(master)
      try {
        await saveVault({ data: row })
      } catch (error) {
        lockVault()
        throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries(passwordVaultQueryOptions),
    onError: (error) =>
      toast.add({
        title: "Couldn't set it",
        description: error.message,
        type: 'error',
      }),
  })
  const form = useForm({
    defaultValues: { master: '', repeat: '' },
    validators: { onSubmit: newMaster },
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
  })

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle>Choose a master password</EmptyTitle>
        <EmptyDescription>
          Your passwords are encrypted in this browser with it, so the server
          only ever stores them scrambled. Forget it and they can’t be
          recovered: nobody can reset it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form
          noValidate
          className="flex w-full max-w-sm flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
          onKeyDownCapture={submitOnModEnter(() => void form.handleSubmit())}
        >
          <FieldGroup>
            <form.Field
              name="master"
              children={(field) => (
                <MasterField
                  field={field}
                  label="Master password"
                  autoFocus
                  autoComplete="new-password"
                />
              )}
            />
            <form.Field
              name="repeat"
              children={(field) => (
                <MasterField
                  field={field}
                  label="Again"
                  autoComplete="new-password"
                />
              )}
            />
          </FieldGroup>
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                Set master password
              </Button>
            )}
          />
        </form>
      </EmptyContent>
    </Empty>
  )
}

/** ⋮ → Change master password: every secret is sealed again with the new
 * key, in the browser, and saved in one go. */
export function ChangeMasterDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change master password</DialogTitle>
          <DialogDescription>
            Every password is encrypted again with the new one. The old one
            stops working.
          </DialogDescription>
        </DialogHeader>
        {open && <ChangeMasterForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ChangeMasterForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: async ({ master }: NewMaster) => {
      // The latest secrets, so none is left under the old key.
      const { passwords } = await getTree()
      const next = await rekeyVault(master, passwords)
      await changeMasterPassword({
        data: { vault: next.vault, entries: next.entries },
      })
      next.commit()
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(passwordVaultQueryOptions),
        queryClient.invalidateQueries(passwordsTreeQueryOptions),
      ])
      toast.add({ title: 'Master password changed', type: 'success' })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't change it",
        description: error.message,
        type: 'error',
      }),
  })
  const form = useForm({
    defaultValues: { master: '', repeat: '' },
    validators: { onSubmit: newMaster },
    onSubmit: ({ value }) => change.mutateAsync(value).catch(() => {}),
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      onKeyDownCapture={submitOnModEnter(() => void form.handleSubmit())}
    >
      <FieldGroup>
        <form.Field
          name="master"
          children={(field) => (
            <MasterField
              field={field}
              label="New master password"
              autoFocus
              autoComplete="new-password"
            />
          )}
        />
        <form.Field
          name="repeat"
          children={(field) => (
            <MasterField
              field={field}
              label="Again"
              autoComplete="new-password"
            />
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Change it
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
