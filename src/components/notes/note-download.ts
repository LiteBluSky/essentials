import type { Note } from '@/db/schema'
import {
  noteFileName,
  noteMarkdown,
  notePdfDefinition,
} from '@/lib/notes/note-file'

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadMarkdown(note: Note) {
  save(
    new Blob([noteMarkdown(note)], { type: 'text/markdown;charset=utf-8' }),
    `${noteFileName(note)}.md`,
  )
}

// pdfmake + its fonts are ~2 MB, so they're loaded on first use only.
async function loadPdfMake() {
  const [pdfMake, vfs, courier] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    import('pdfmake/build/standard-fonts/Courier'),
  ])
  // UMD builds: the API may sit on `default` depending on the interop.
  const api = ('default' in pdfMake ? pdfMake.default : pdfMake) as Omit<
    typeof pdfMake,
    'default'
  >
  api.addVirtualFileSystem(vfs.default)
  api.addFontContainer(courier.default)
  return api
}

let pdfMakeReady: ReturnType<typeof loadPdfMake> | undefined

export async function downloadPdf(note: Note, path: Array<string>) {
  pdfMakeReady ??= loadPdfMake().catch((error: unknown) => {
    pdfMakeReady = undefined
    throw error
  })
  const pdfMake = await pdfMakeReady
  const blob = await pdfMake.createPdf(notePdfDefinition(note, path)).getBlob()
  save(blob, `${noteFileName(note)}.pdf`)
}
