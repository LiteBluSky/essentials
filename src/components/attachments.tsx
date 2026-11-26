import { FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { ATTACH_ACCEPT } from '@/lib/attachments'
import type { AttachmentMeta } from '@/lib/attachments'
import { cn } from '@/lib/utils'
import { Hint } from '@/components/hint'

// Files for Jarvis (lib/attachments.ts): the paperclip that picks them, the
// chips of what's attached in a box, the names on a sent message, and the
// hint shown while files are dragged over the page.

/** The paperclip in a Jarvis box: picks files (on a phone, a photo too). */
export function AttachButton({
  onFiles,
  disabled,
  size = 'icon-sm',
}: {
  onFiles: (files: Array<File>) => void
  disabled?: boolean
  size?: 'icon-xs' | 'icon-sm'
}) {
  const input = useRef<HTMLInputElement>(null)
  const label = `Attach files for ${ASSISTANT_NAME} to read (or drop / paste them)`
  return (
    <>
      <Hint label={label}>
        <InputGroupButton
          type="button"
          size={size}
          aria-label={label}
          disabled={disabled}
          // Keeps the field's focus (a phone keeps its keyboard).
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => input.current?.click()}
        >
          <PaperclipIcon />
        </InputGroupButton>
      </Hint>
      <input
        ref={input}
        type="file"
        multiple
        accept={ATTACH_ACCEPT}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = '' // The same file can be picked again.
        }}
      />
    </>
  )
}

function FileIcon({ kind }: { kind: AttachmentMeta['kind'] }) {
  return kind === 'image' ? (
    <ImageIcon data-icon="inline-start" />
  ) : (
    <FileTextIcon data-icon="inline-start" />
  )
}

/** What's attached in a box, above the text, each with a remove button. */
export function AttachmentChips({
  files,
  onRemove,
  disabled,
}: {
  files: Array<AttachmentMeta>
  onRemove: (index: number) => void
  disabled?: boolean
}) {
  if (!files.length) return null
  return (
    <InputGroupAddon align="block-start" className="flex-wrap gap-1.5 p-2 pb-0">
      {files.map((file, i) => (
        <Badge
          key={`${i}-${file.name}`}
          variant="secondary"
          className="h-6 max-w-56 pr-0.5"
        >
          <FileIcon kind={file.kind} />
          <span className="truncate">{file.name}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-5"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={() => onRemove(i)}
          >
            <XIcon />
          </Button>
        </Badge>
      ))}
    </InputGroupAddon>
  )
}

/** The files a sent message came with (names only: they aren't kept). */
export function AttachmentNames({
  files,
  className,
}: {
  files: Array<AttachmentMeta>
  className?: string
}) {
  if (!files.length) return null
  return (
    <div className={cn('flex flex-wrap justify-end gap-1.5', className)}>
      {files.map((file, i) => (
        <Hint label={file.name} key={`${i}-${file.name}`}>
          <Badge variant="outline" className="max-w-56">
            <FileIcon kind={file.kind} />
            <span className="truncate">{file.name}</span>
          </Badge>
        </Hint>
      ))}
    </div>
  )
}

/** Over a Jarvis box while files are dragged over the page. */
export function DropHint({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/90 text-sm font-medium">
      Drop the files for {ASSISTANT_NAME}
    </div>
  )
}
