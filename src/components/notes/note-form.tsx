import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import type { Note } from '@/db/schema'
import {
  applyEdit,
  continueList,
  indentLines,
  insertLink,
  lineContent,
  toggleLines,
  toggleWrap,
} from '@/lib/notes/markdown-edit'
import type { Edit, LineStyle } from '@/lib/notes/markdown-edit'
import { noteInput } from '@/lib/notes/schemas'
import type { NoteInput } from '@/lib/notes/schemas'
import { MOD_LABEL } from '@/lib/shortcuts'
import { isNoteEmpty } from '@/lib/notes/tree'
import type { FolderOption } from '@/lib/notes/tree'
import {
  createNote,
  notesTreeQueryOptions,
  updateNote,
} from '@/server/notes.functions'
import { FolderSelect } from './folder-select'

/** What to do once the note is saved: show its preview, or close. */
export type AfterSave = 'view' | 'close'

type Sel = { value: string; start: number; end: number }

const TOOLBAR: Array<{
  label: string
  keys?: string
  icon: typeof BoldIcon
  edit: (sel: Sel) => Edit
}> = [
  {
    label: 'Bold',
    keys: 'B',
    icon: BoldIcon,
    edit: (s) => toggleWrap(s, '**'),
  },
  {
    label: 'Italic',
    keys: 'I',
    icon: ItalicIcon,
    edit: (s) => toggleWrap(s, '_'),
  },
  {
    label: 'Strikethrough',
    icon: StrikethroughIcon,
    edit: (s) => toggleWrap(s, '~~'),
  },
  { label: 'Code', icon: CodeIcon, edit: (s) => toggleWrap(s, '`') },
  { label: 'Link', keys: 'K', icon: LinkIcon, edit: insertLink },
]

const LINE_TOOLS: Array<{
  label: string
  icon: typeof BoldIcon
  style: LineStyle
}> = [
  { label: 'Heading', icon: Heading2Icon, style: 'heading' },
  { label: 'Bullet list', icon: ListIcon, style: 'bullet' },
  { label: 'Numbered list', icon: ListOrderedIcon, style: 'number' },
  { label: 'Checklist', icon: ListChecksIcon, style: 'task' },
  { label: 'Quote', icon: QuoteIcon, style: 'quote' },
]

/** Every toolbar option in order, for Ctrl+M's format mode. Inline styles
 * wrap the selection, or else the caret's line. */
const FORMATS: Array<{ label: string; edit: (sel: Sel) => Edit }> = [
  ...TOOLBAR.map((tool) => ({
    label: tool.label,
    edit: (sel: Sel) => tool.edit(lineContent(sel)),
  })),
  ...LINE_TOOLS.map((tool) => ({
    label: tool.label,
    edit: (sel: Sel) => toggleLines(sel, tool.style),
  })),
]

export function NoteForm({
  note,
  folderId,
  folderOptions,
  closeRef,
  onDone,
}: {
  note?: Note
  folderId: number | null
  folderOptions: Array<FolderOption>
  /** Set to a "save, then close" handler, used when the dialog is dismissed. */
  closeRef: RefObject<(() => Promise<void>) | null>
  /** `id` is null when a new note was left empty (nothing saved). */
  onDone: (then: AfterSave, id: number | null) => void
}) {
  const queryClient = useQueryClient()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const afterSave = useRef<AfterSave>('view')

  const save = useMutation({
    mutationFn: async (value: NoteInput) => {
      if (note) {
        await updateNote({ data: { id: note.id, ...value } })
        return note.id
      }
      const row = await createNote({ data: value })
      return row.id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries(notesTreeQueryOptions)
      toast.add({
        title: note ? 'Note saved' : 'Note created',
        type: 'success',
      })
      onDone(afterSave.current, id)
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save note",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    defaultValues: {
      title: note?.title ?? '',
      body: note?.body ?? '',
      folderId: note ? note.folderId : folderId,
    },
    validators: { onSubmit: noteInput },
    onSubmit: async ({ value, formApi }) => {
      // Nothing to save: a blank new note is dropped, an untouched one kept.
      if (!note && isNoteEmpty(value)) return onDone(afterSave.current, null)
      if (note && !formApi.state.isDirty) {
        return onDone(afterSave.current, note.id)
      }
      await save.mutateAsync(value)
    },
  })

  const submit = (then: AfterSave) => {
    afterSave.current = then
    return form.handleSubmit()
  }
  useEffect(() => {
    closeRef.current = () => submit('close')
    return () => {
      closeRef.current = null
    }
  })

  // Ctrl+M: pick a toolbar option with h/l, Enter applies it to the line.
  // The index of the highlighted option, null when not choosing.
  const [formatAt, setFormatAt] = useState<number | null>(null)
  const lastFormat = useRef(0)

  const runEdit = (make: (sel: Sel) => Edit | null) => {
    const el = bodyRef.current
    if (!el) return false
    const edit = make({
      value: el.value,
      start: el.selectionStart,
      end: el.selectionEnd,
    })
    if (!edit) return false
    applyEdit(el, edit)
    return true
  }

  const onFormatKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>,
    at: number,
  ) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.altKey && e.key.toLowerCase() === 'm') {
      e.preventDefault()
      setFormatAt(null)
      return
    }
    // Other shortcuts (Ctrl+S...) leave the mode and do their usual thing.
    if (mod || e.altKey) {
      setFormatAt(null)
      return
    }
    // Everything else is a format-mode key: nothing gets typed.
    e.preventDefault()
    const last = FORMATS.length - 1
    switch (e.key) {
      case 'h':
      case 'ArrowLeft':
        setFormatAt(at === 0 ? last : at - 1)
        break
      case 'l':
      case 'ArrowRight':
        setFormatAt(at === last ? 0 : at + 1)
        break
      case '0':
      case '^':
        setFormatAt(0)
        break
      case '$':
        setFormatAt(last)
        break
      case 'Enter':
      case ' ':
        lastFormat.current = at
        setFormatAt(null)
        runEdit(FORMATS[at].edit)
        break
      case 'Escape':
        // Leave the mode, don't close (and save) the dialog.
        e.stopPropagation()
        setFormatAt(null)
        break
    }
  }

  const onBodyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (formatAt !== null) return onFormatKeyDown(e, formatAt)
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault()
      setFormatAt(lastFormat.current)
      return
    }
    if (mod && !e.altKey && !e.shiftKey) {
      const tool = TOOLBAR.find((t) => t.keys?.toLowerCase() === e.key)
      if (tool) {
        e.preventDefault()
        runEdit(tool.edit)
      }
      return
    }
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
      if (runEdit(continueList)) e.preventDefault()
      return
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault()
      runEdit((sel) => indentLines(sel, e.shiftKey))
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit('view')
      }}
      onKeyDown={(e) => {
        // Ctrl+Enter / Ctrl+S: save and show the note.
        const mod = e.ctrlKey || e.metaKey
        if (mod && (e.key === 'Enter' || e.key === 's')) {
          e.preventDefault()
          void submit('view')
        }
      }}
      className="flex min-h-0 flex-col gap-6"
    >
      <FieldGroup className="min-h-0">
        <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
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
                    placeholder="Optional"
                    autoFocus
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter in the title moves on to the note.
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                        bodyRef.current?.focus()
                      }
                    }}
                    aria-invalid={isInvalid}
                  />
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
        </div>
        <form.Field
          name="body"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel htmlFor={field.name}>Note</FieldLabel>
                  <div className="flex flex-wrap gap-1">
                    <ButtonGroup aria-label="Text formatting">
                      {TOOLBAR.map((tool, i) => (
                        <ToolButton
                          key={tool.label}
                          label={tool.label}
                          keys={tool.keys}
                          icon={tool.icon}
                          active={formatAt === i}
                          onClick={() => {
                            setFormatAt(null)
                            runEdit(tool.edit)
                          }}
                        />
                      ))}
                    </ButtonGroup>
                    <ButtonGroup aria-label="Lists and blocks">
                      {LINE_TOOLS.map((tool, i) => (
                        <ToolButton
                          key={tool.label}
                          label={tool.label}
                          icon={tool.icon}
                          active={formatAt === TOOLBAR.length + i}
                          onClick={() => {
                            setFormatAt(null)
                            runEdit((sel) => toggleLines(sel, tool.style))
                          }}
                        />
                      ))}
                    </ButtonGroup>
                  </div>
                </div>
                <Textarea
                  ref={bodyRef}
                  id={field.name}
                  name={field.name}
                  placeholder="Write here. Markdown works: **bold**, - lists, - [ ] checkboxes, # headings…"
                  className="max-h-[55dvh] min-h-[40dvh] font-mono"
                  value={field.state.value}
                  onBlur={() => {
                    field.handleBlur()
                    setFormatAt(null)
                  }}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onKeyDown={onBodyKeyDown}
                  aria-invalid={isInvalid}
                />
                <FieldDescription className="max-sm:hidden" aria-live="polite">
                  {formatAt === null ? (
                    <>
                      Lists continue on Enter, Tab indents, {MOD_LABEL}+M
                      formats the line. Esc or clicking outside saves and
                      closes.
                    </>
                  ) : (
                    <>
                      Format the line ({FORMATS[formatAt].label}): <Kbd>h</Kbd>{' '}
                      <Kbd>l</Kbd> to choose, <Kbd>Enter</Kbd> to apply,{' '}
                      <Kbd>Esc</Kbd> to cancel.
                    </>
                  )}
                </FieldDescription>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" />}
          // Cancel discards: skip the save-on-close handler.
          onClick={() => {
            closeRef.current = null
          }}
        >
          Cancel
        </DialogClose>
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {note ? 'Save' : 'Create note'}
              <KbdGroup className="max-sm:hidden">
                <Kbd>{MOD_LABEL}</Kbd>
                <Kbd>Enter</Kbd>
              </KbdGroup>
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}

function ToolButton({
  label,
  keys,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string
  keys?: string
  icon: typeof BoldIcon
  /** Highlighted while choosing a format with Ctrl+M. */
  active?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      size="icon-sm"
      aria-label={label}
      title={keys ? `${label} (${MOD_LABEL}+${keys})` : label}
      // Keep the textarea's selection: don't take focus on press.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon />
    </Button>
  )
}
