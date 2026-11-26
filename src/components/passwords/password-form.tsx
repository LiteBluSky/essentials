import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EyeIcon, EyeOffIcon, RefreshCwIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { ReferenceAutocomplete } from '@/components/reference-autocomplete'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import type { Password } from '@/db/schema'
import { passwordForm } from '@/lib/passwords/schemas'
import type { PasswordForm as FormValues } from '@/lib/passwords/schemas'
import type { FolderOption } from '@/lib/passwords/tree'
import { generatePassword, openSecret, sealSecret } from '@/lib/passwords/vault'
import {
  createPassword,
  passwordsTreeQueryOptions,
  updatePassword,
} from '@/server/passwords.functions'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import { FolderSelect } from './folder-select'
import { Hint } from '@/components/hint'

const TEXT_FIELDS: Array<{
  name: 'name' | 'username' | 'url'
  label: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
}> = [
  { name: 'name', label: 'Name', placeholder: 'GitHub, the bank…' },
  { name: 'username', label: 'Username', placeholder: 'Email or user name' },
  {
    name: 'url',
    label: 'Website',
    inputMode: 'url',
    placeholder: 'github.com, or @ for a bookmark',
  },
]

/** New / edit a password. The password and notes are sealed here, in the
 * browser, before they're sent (the vault is unlocked: the page shows
 * nothing else while it's locked). */
export function PasswordForm({
  password,
  folderId,
  folderOptions,
  onDone,
}: {
  password?: Password
  folderId: number | null
  folderOptions: Array<FolderOption>
  onDone: (passwordId: number) => void
}) {
  const queryClient = useQueryClient()
  const [shown, setShown] = useState(!password)
  // The website can be a bookmark instead: `@` suggests them.
  const urlRef = useRef<HTMLInputElement>(null)
  const save = useMutation({
    mutationFn: async ({ password: clear, notes, ...value }: FormValues) => {
      const data = {
        ...value,
        secret: sealSecret({ password: clear, notes }),
      }
      if (!password) return (await createPassword({ data })).id
      await updatePassword({ data: { id: password.id, ...data } })
      return password.id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries(passwordsTreeQueryOptions)
      toast.add({
        title: password ? 'Password updated' : 'Password added',
        type: 'success',
      })
      onDone(id)
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save password",
        description: error.message,
        type: 'error',
      }),
  })

  const [secret] = useState(() =>
    password ? openSecret(password.secret) : { password: '', notes: '' },
  )
  const defaultValues: FormValues = {
    name: password?.name ?? '',
    username: password?.username ?? '',
    url: password?.url ?? '',
    password: secret.password,
    notes: secret.notes,
    folderId: password ? password.folderId : folderId,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: passwordForm },
    onSubmit: ({ value }) => save.mutateAsync(value),
  })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      // Ctrl+Enter saves from any field.
      onKeyDownCapture={submitOnModEnter(() => void form.handleSubmit())}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        {TEXT_FIELDS.map((spec) => (
          <form.Field
            key={spec.name}
            name={spec.name}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>{spec.label}</FieldLabel>
                  <Input
                    ref={spec.name === 'url' ? urlRef : undefined}
                    id={field.name}
                    name={field.name}
                    inputMode={spec.inputMode}
                    autoFocus={spec.name === 'name'}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={spec.placeholder}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {spec.name === 'url' && (
                    <ReferenceAutocomplete
                      target={urlRef}
                      types={['bookmark']}
                    />
                  )}
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        ))}
        <form.Field
          name="password"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    name={field.name}
                    type={shown ? 'text' : 'password'}
                    // Not the browser's own password manager.
                    autoComplete="off"
                    data-1p-ignore
                    autoCapitalize="none"
                    spellCheck={false}
                    className="font-mono"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={
                        shown ? 'Hide the password' : 'Show the password'
                      }
                      aria-pressed={shown}
                      onClick={() => setShown((s) => !s)}
                    >
                      {shown ? <EyeOffIcon /> : <EyeIcon />}
                    </InputGroupButton>
                    <Hint label={'Generate a strong password'}>
                      <InputGroupButton
                        size="icon-xs"
                        aria-label="Generate a strong password"
                        onClick={() => {
                          field.handleChange(generatePassword())
                          setShown(true)
                        }}
                      >
                        <RefreshCwIcon />
                      </InputGroupButton>
                    </Hint>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  Encrypted in this browser with your master password.
                </FieldDescription>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="folderId"
          children={(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Folder</FieldLabel>
              <FolderSelect
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                options={folderOptions}
              />
            </Field>
          )}
        />
        <form.Field
          name="notes"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  rows={3}
                  placeholder="Security questions, recovery codes… (encrypted too)"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {password ? 'Save' : 'Add password'}
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
