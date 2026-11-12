import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

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
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import type { Link } from '@/db/schema'
import { linkInput } from '@/lib/bookmarks/schemas'
import type { LinkInput } from '@/lib/bookmarks/schemas'
import type { FolderOption } from '@/lib/bookmarks/tree'
import {
  createLink,
  bookmarksTreeQueryOptions,
  updateLink,
} from '@/server/bookmarks.functions'
import { FolderSelect } from './folder-select'

// "example.com/page" -> "https://example.com/page"
function withScheme(value: string) {
  const trimmed = value.trim()
  if (!trimmed || /^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function LinkForm({
  link,
  folderId,
  folderOptions,
  onDone,
}: {
  link?: Link
  folderId: number | null
  folderOptions: Array<FolderOption>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const save = useMutation({
    mutationFn: async (value: LinkInput) => {
      if (link) await updateLink({ data: { id: link.id, ...value } })
      else await createLink({ data: value })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(bookmarksTreeQueryOptions)
      toast.add({
        title: link ? 'Link updated' : 'Link added',
        type: 'success',
      })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save link",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      title: link?.title ?? '',
      url: link?.url ?? '',
      description: link?.description ?? '',
      folderId: link ? link.folderId : folderId,
    },
    validators: { onSubmit: linkInput },
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
        <form.Field
          name="url"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>URL</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="url"
                  autoFocus
                  autoComplete="off"
                  placeholder="https://"
                  value={field.state.value}
                  onBlur={() => {
                    field.handleChange(withScheme(field.state.value))
                    field.handleBlur()
                  }}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="title"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="off"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                <FieldDescription>
                  Leave empty to use the site's domain.
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
          name="description"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
                <Textarea
                  ref={descriptionRef}
                  id={field.name}
                  name={field.name}
                  rows={2}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />
                <ReferenceAutocomplete target={descriptionRef} />
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
              {link ? 'Save' : 'Add link'}
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
