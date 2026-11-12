import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  MonitorDownIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { NotesBin } from './bin'

import { SettingsDialog } from '@/components/settings-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { useInstallApp } from '@/hooks/use-install-app'
import { APP_NAME } from '@/lib/config'
import { notesFile } from '@/lib/notes/schemas'
import type { NotesFile } from '@/lib/notes/schemas'
import { toNotesFile } from '@/lib/notes/tree'
import type { Tree } from '@/lib/notes/tree'
import { importNotes, notesTreeQueryOptions } from '@/server/notes.functions'

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function download(tree: Tree) {
  const json = JSON.stringify(toNotesFile(tree), null, 2)
  const url = URL.createObjectURL(
    new Blob([json], { type: 'application/json' }),
  )
  const slug = `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'essentials'}-notes`
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function readFile(file: File): Promise<NotesFile> {
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't valid JSON.")
  }
  const parsed = notesFile.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue.path.length ? ` (at ${issue.path.join('.')})` : ''
    throw new Error(`${issue.message}${where}`)
  }
  return parsed.data
}

// Header menu: export the whole tree as JSON, or import a file in the same
// format (added after what's already there, never replacing it). Also
// installs the app (PWA) where the browser allows it.
export function ImportExportMenu({ tree }: { tree: Tree }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [binOpen, setBinOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const app = useInstallApp()

  const install = async () => {
    if (app.state === 'prompt') {
      await app.install()
    } else if (app.state === 'ios') {
      toast.add({
        title: 'Add to Home Screen',
        description:
          'In Safari, tap the Share button, then “Add to Home Screen”.',
      })
    } else {
      toast.add({
        title: "Your browser didn't offer to install",
        description:
          'Use the browser menu’s “Install app” / “Add to Home screen”. Installing needs https (or localhost).',
      })
    }
  }

  const importFile = useMutation({
    mutationFn: async (file: File) =>
      importNotes({ data: await readFile(file) }),
    onSuccess: async ({ folders, notes }) => {
      await queryClient.invalidateQueries(notesTreeQueryOptions)
      toast.add({
        title: `Imported ${plural(folders, 'folder')} and ${plural(notes, 'note')}`,
        type: 'success',
      })
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't import",
        description: error.message,
        type: 'error',
      }),
  })

  const isEmpty = !tree.folders.length && !tree.notes.length

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label="More" />}
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Notes file</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={importFile.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              Import JSON…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isEmpty} onClick={() => download(tree)}>
              <DownloadIcon />
              Export JSON
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setBinOpen(true)}>
              <Trash2Icon />
              Bin
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
              Settings…
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {app.state !== 'installed' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={install}>
                  <MonitorDownIcon />
                  Install app…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <NotesBin open={binOpen} onOpenChange={setBinOpen} />
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) importFile.mutate(file)
        }}
      />
    </>
  )
}
