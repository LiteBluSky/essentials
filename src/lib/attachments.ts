import { z } from 'zod'

// Files given to Jarvis (dropped on, pasted into or picked from the chat box
// / Ask Jarvis field) as context for this one request: a receipt, a PDF, a
// photo of a business card, a CSV… Jarvis reads them and puts what's in them
// into the apps (tasks, notes, contacts, money entries…); it never makes
// files. They're sent to the model with the message and not kept: the saved
// message keeps only their names (`AttachmentMeta`).

/** At most this many files per message. */
export const MAX_ATTACHMENTS = 5
/** A text file's characters sent to the model (the rest is cut). */
const MAX_TEXT_CHARS = 100_000
/** A text file bigger than this isn't read at all. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024
/** A PDF bigger than this is refused (the providers cap a request ~32 MB). */
const MAX_PDF_BYTES = 10 * 1024 * 1024
/** Images are scaled down to this long edge (what the models see anyway). */
const MAX_IMAGE_EDGE = 1568
/** All of a message's files together, as sent (base64 / text). */
export const MAX_TOTAL_CHARS = 24 * 1024 * 1024

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

/** Text files read as text, by extension (their MIME type is often empty). */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'xml',
  'html',
  'htm',
  'ics',
  'vcf',
  'log',
  'yaml',
  'yml',
  'toml',
  'ini',
  'srt',
  'sql',
  'js',
  'ts',
  'py',
  'sh',
])

/** The file picker's `accept`. */
export const ATTACH_ACCEPT = [
  ...IMAGE_TYPES,
  'application/pdf',
  'text/*',
  ...[...TEXT_EXTENSIONS].map((ext) => `.${ext}`),
].join(',')

export const attachment = z
  .object({
    name: z.string().trim().min(1).max(255),
    kind: z.enum(['text', 'image', 'pdf']),
    /** image: one of `IMAGE_TYPES`; pdf: application/pdf; text: anything. */
    mediaType: z.string().max(100),
    /** The text itself, or the file's bytes in base64. */
    data: z.string().min(1).max(MAX_TOTAL_CHARS),
  })
  .refine(
    (a) =>
      a.kind !== 'image' ||
      (IMAGE_TYPES as ReadonlyArray<string>).includes(a.mediaType),
    'Unsupported image type',
  )
export type Attachment = z.infer<typeof attachment>

export const attachmentsInput = z
  .array(attachment)
  .max(MAX_ATTACHMENTS, `At most ${MAX_ATTACHMENTS} files at a time`)
  .refine(
    (files) => files.reduce((n, f) => n + f.data.length, 0) <= MAX_TOTAL_CHARS,
    'The files are too big together',
  )
  .default([])

/** What's kept of a file with the saved message (and shown on it). */
export type AttachmentMeta = { name: string; kind: Attachment['kind'] }

export function attachmentMeta(
  files: Array<Attachment>,
): Array<AttachmentMeta> {
  return files.map(({ name, kind }) => ({ name, kind }))
}

/** A saved message's `attachments` column, parsed (never throws). */
export function parseAttachments(json: string | null): Array<AttachmentMeta> {
  if (!json) return []
  try {
    const list = JSON.parse(json) as unknown
    return Array.isArray(list)
      ? list.filter(
          (a): a is AttachmentMeta =>
            !!a && typeof (a as AttachmentMeta).name === 'string',
        )
      : []
  } catch {
    return []
  }
}

/** "receipt.pdf, card.jpg". */
export function attachmentNames(files: Array<{ name: string }>) {
  return files.map((f) => f.name).join(', ')
}

/** What the message says when it's only files. */
export const FILES_ONLY_TEXT =
  '(No message, just the attached files: work out what in them belongs in the app and add it there.)'

// ---- Browser -----------------------------------------------------------------

function extension(name: string) {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function kindOf(file: File): Attachment['kind'] | null {
  const type = file.type.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf' || extension(file.name) === 'pdf') return 'pdf'
  if (
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/xml' ||
    TEXT_EXTENSIONS.has(extension(file.name))
  ) {
    return 'text'
  }
  return null
}

function base64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < view.length; i += step) {
    binary += String.fromCharCode(...view.subarray(i, i + step))
  }
  return btoa(binary)
}

/** An image as JPEG, at most `MAX_IMAGE_EDGE` on its long edge (a phone
 * photo goes from ~4 MB to ~300 KB; the model sees no more than that). A
 * small image in a supported type is sent as is. */
async function readImage(
  file: File,
): Promise<Pick<Attachment, 'mediaType' | 'data'>> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
  )
  const supported = (IMAGE_TYPES as ReadonlyArray<string>).includes(file.type)
  if (scale === 1 && supported && file.size <= 1024 * 1024) {
    bitmap.close()
    return { mediaType: file.type, data: base64(await file.arrayBuffer()) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error("Couldn't read the image")
  // JPEG has no transparency: white behind it, like paper.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  if (!blob) throw new Error("Couldn't read the image")
  return { mediaType: 'image/jpeg', data: base64(await blob.arrayBuffer()) }
}

/** Reads a file for Jarvis; throws (a message for the user) when it can't
 * be sent: an unsupported type, too big, or a binary "text" file. */
export async function readAttachment(file: File): Promise<Attachment> {
  const kind = kindOf(file)
  const name = file.name || 'file'
  if (!kind) {
    throw new Error(
      `${name}: can't read that kind of file. Attach a PDF, an image or a text file (CSV, Markdown…).`,
    )
  }
  if (kind === 'image') {
    return { name, kind, ...(await readImage(file)) }
  }
  if (kind === 'pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`${name} is too big (PDFs up to 10 MB)`)
    }
    return {
      name,
      kind,
      mediaType: 'application/pdf',
      data: base64(await file.arrayBuffer()),
    }
  }
  if (file.size > MAX_TEXT_BYTES) {
    throw new Error(`${name} is too big (text files up to 2 MB)`)
  }
  const text = await file.text()
  if (text.includes('\u0000')) {
    throw new Error(`${name}: can't read that kind of file`)
  }
  if (!text.trim()) throw new Error(`${name} is empty`)
  return {
    name,
    kind,
    mediaType: file.type || 'text/plain',
    data:
      text.length > MAX_TEXT_CHARS
        ? `${text.slice(0, MAX_TEXT_CHARS)}\n… (cut short)`
        : text,
  }
}
