import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'

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
import { toast } from '@/components/ui/toast'
import type { Folder } from '@/db/schema'
import { folderInput } from '@/lib/bookmarks/schemas'
import type { FolderInput } from '@/lib/bookmarks/schemas'
import type { FolderOption } from '@/lib/bookmarks/tree'
import {
  createFolder,
  bookmarksTreeQueryOptions,
  updateFolder,
} from '@/server/bookmarks.functions'
import { submitOnModEnter } from '@/lib/submit-shortcut'
import { FolderSelect } from './folder-select'

export function FolderForm({
  folder,
  parentId,
  folderOptions,
  onDone,
}: {
  folder?: Folder
  parentId: number | null
  /** Must already exclude `folder` and its descendants. */
  folderOptions: Array<FolderOption>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async (value: FolderInput) => {
      if (folder) await updateFolder({ data: { id: folder.id, ...value } })
      else await createFolder({ data: value })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries(bookmarksTreeQueryOptions)
      toast.add({
        title: folder ? 'Folder updated' : 'Folder created',
        type: 'success',
      })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save folder",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      name: folder?.name ?? '',
      parentId: folder ? folder.parentId : parentId,
    },
    validators: { onSubmit: folderInput },
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
        <form.Field
          name="name"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoFocus
                  autoComplete="off"
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
          name="parentId"
          children={(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Inside</FieldLabel>
              <FolderSelect
                id={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                options={folderOptions}
              />
            </Field>
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
              {folder ? 'Save' : 'Create folder'}
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
