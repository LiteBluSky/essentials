import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/toast'
import {
  MAX_ATTACHMENTS,
  MAX_TOTAL_CHARS,
  readAttachment,
} from '@/lib/attachments'
import type { Attachment } from '@/lib/attachments'

/**
 * The files waiting to go with the next message in a Jarvis box (Chat's
 * box, the panel, the Ask Jarvis field): `add` reads them in the browser
 * (images scaled down; anything it can't send is a toast), `take` hands
 * them over when the message is sent and empties the list.
 */
export function useAttachments() {
  const [files, setFiles] = useState<Array<Attachment>>([])
  const [reading, setReading] = useState(0)
  // The list as of now, for adds that finish one after another.
  const current = useRef(files)
  current.current = files

  const add = async (list: Iterable<File>) => {
    const picked = [...list]
    if (!picked.length) return
    setReading((n) => n + 1)
    try {
      for (const file of picked) {
        if (current.current.length >= MAX_ATTACHMENTS) {
          toast.add({
            title: `At most ${MAX_ATTACHMENTS} files at a time`,
            type: 'error',
          })
          break
        }
        try {
          const read = await readAttachment(file)
          const total =
            current.current.reduce((n, f) => n + f.data.length, 0) +
            read.data.length
          if (total > MAX_TOTAL_CHARS) {
            throw new Error(`${read.name}: the files are too big together`)
          }
          current.current = [...current.current, read]
          setFiles(current.current)
        } catch (error) {
          toast.add({
            title: "Couldn't attach that",
            description: error instanceof Error ? error.message : String(error),
            type: 'error',
          })
        }
      }
    } finally {
      setReading((n) => n - 1)
    }
  }

  return {
    files,
    /** Still reading a file (sending waits). */
    reading: reading > 0,
    add,
    remove: (index: number) =>
      setFiles((list) => list.filter((_, i) => i !== index)),
    /** Empties the list and returns what was in it (to send). */
    take: () => {
      const taken = current.current
      current.current = []
      setFiles([])
      return taken
    },
    /** Puts files back (a message that didn't go through). */
    restore: (back: Array<Attachment>) => {
      current.current = back
      setFiles(back)
    },
  }
}

export type Attachments = ReturnType<typeof useAttachments>

/** Whether a drag carries files (not a tree row, not selected text). */
function hasFiles(e: DragEvent) {
  return e.dataTransfer?.types.includes('Files') ?? false
}

/**
 * Files dragged from the computer anywhere onto the page go to this box
 * while `enabled` (the box on screen, no dialog open). Returns whether
 * files are being dragged over the page (to show where they'll go).
 */
export function useFileDrop(
  enabled: boolean,
  onFiles: (files: Array<File>) => void,
) {
  const [dragging, setDragging] = useState(false)
  const latest = useRef(onFiles)
  latest.current = onFiles

  useEffect(() => {
    if (!enabled) {
      setDragging(false)
      return
    }
    // dragenter / dragleave fire for every element crossed: count them.
    let depth = 0
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      // Lets the drop happen (instead of the browser opening the file).
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      depth = 0
      setDragging(false)
      if (!hasFiles(e) || e.defaultPrevented) return
      e.preventDefault()
      latest.current([...(e.dataTransfer?.files ?? [])])
    }
    const onEnd = () => {
      depth = 0
      setDragging(false)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onEnd)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onEnd)
    }
  }, [enabled])

  return dragging
}

/** A paste holding files and no text (a screenshot, files copied in the
 * file manager) attaches them instead. */
export function pastedFiles(e: React.ClipboardEvent): Array<File> | null {
  const data = e.clipboardData
  if (!data.files.length || data.types.includes('text/plain')) return null
  return [...data.files]
}
