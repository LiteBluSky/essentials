import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { ReferenceAutocomplete } from '@/components/reference-autocomplete'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import type { Contact } from '@/db/schema'
import { contactInput } from '@/lib/contacts/schemas'
import type { ContactInput } from '@/lib/contacts/schemas'
import type { FolderOption } from '@/lib/contacts/tree'
import {
  contactsTreeQueryOptions,
  createContact,
  updateContact,
} from '@/server/contacts.functions'
import { FolderSelect } from './folder-select'

type TextField = 'name' | 'phone' | 'email' | 'knownFrom'

const TEXT_FIELDS: Array<{
  name: TextField
  label: string
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete: string
  placeholder?: string
}> = [
  { name: 'name', label: 'Name', autoComplete: 'off' },
  {
    name: 'phone',
    label: 'Phone',
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'off',
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    inputMode: 'email',
    autoComplete: 'off',
  },
  {
    name: 'knownFrom',
    label: 'Known from',
    autoComplete: 'off',
    placeholder: 'Work, school, the gym…',
  },
]

export function ContactForm({
  contact,
  folderId,
  folderOptions,
  onDone,
}: {
  contact?: Contact
  folderId: number | null
  folderOptions: Array<FolderOption>
  onDone: (contactId: number) => void
}) {
  const queryClient = useQueryClient()
  const contextRef = useRef<HTMLTextAreaElement>(null)
  const save = useMutation({
    mutationFn: async (value: ContactInput) => {
      if (!contact) return (await createContact({ data: value })).id
      await updateContact({ data: { id: contact.id, ...value } })
      return contact.id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries(contactsTreeQueryOptions)
      toast.add({
        title: contact ? 'Contact updated' : 'Contact added',
        type: 'success',
      })
      onDone(id)
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save contact",
        description: error.message,
        type: 'error',
      }),
  })

  const defaultValues: ContactInput = {
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    address: contact?.address ?? '',
    knownFrom: contact?.knownFrom ?? '',
    description: contact?.description ?? '',
    folderId: contact ? contact.folderId : folderId,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: contactInput },
    onSubmit: ({ value }) => save.mutateAsync(value),
  })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
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
                    id={field.name}
                    name={field.name}
                    type={spec.type}
                    inputMode={spec.inputMode}
                    autoFocus={spec.name === 'name'}
                    autoComplete={spec.autoComplete}
                    placeholder={spec.placeholder}
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
        ))}
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
          name="address"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Address</FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  rows={2}
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
        <form.Field
          name="description"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Context</FieldLabel>
                <Textarea
                  ref={contextRef}
                  id={field.name}
                  name={field.name}
                  rows={3}
                  placeholder="Anything worth remembering (@ links to anything)"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                <ReferenceAutocomplete target={contextRef} />
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
              {contact ? 'Save' : 'Add contact'}
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
