import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  MonitorDownIcon,
  HistoryIcon,
  KeyRoundIcon,
  LockIcon,
  SettingsIcon,
  UploadIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { AssistantHistoryDialog } from '@/components/assistant-history-dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ShortcutKey } from '@/components/shortcut-key'
import { toast } from '@/components/ui/toast'
import { useInstallApp } from '@/hooks/use-install-app'
import { APP_NAME } from '@/lib/config'
import { passwordsFile } from '@/lib/passwords/schemas'
import type { PasswordsFile } from '@/lib/passwords/schemas'
import { sealImport, toPasswordsFile } from '@/lib/passwords/tree'
import { lockVault, openSecret, sealSecret } from '@/lib/passwords/vault'
import { ChangeMasterDialog } from './vault-forms'
import type { Tree } from '@/lib/passwords/tree'
import {
  importPasswords,
  passwordsTreeQueryOptions,
} from '@/server/passwords.functions'
import { ASSISTANT_NAME } from '@/lib/assistant'

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function download(tree: Tree) {
  const json = JSON.stringify(toPasswordsFile(tree, openSecret), null, 2)
  const url = URL.createObjectURL(
    new Blob([json], { type: 'application/json' }),
  )
  const slug = `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'essentials'}-passwords`
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function readFile(file: File): Promise<PasswordsFile> {
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't valid JSON.")
  }
  const parsed = passwordsFile.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue.path.length ? ` (at ${issue.path.join('.')})` : ''
    throw new Error(`${issue.message}${where}`)
  }
  return parsed.data
}

// Header menu: lock the vault, change the master password, export the whole
// tree as JSON (unencrypted: for moving elsewhere or a backup kept safe) or
// import a file in the same format (sealed here first, then added after
// what's already there, never replacing it). Also installs the app (PWA)
// where the browser allows it.
export function ImportExportMenu({
  tree,
  unlocked,
}: {
  tree: Tree
  unlocked: boolean
}) {
  const [masterOpen, setMasterOpen] = useState(false)
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
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
      importPasswords({ data: sealImport(await readFile(file), sealSecret) }),
    onSuccess: async ({ folders, passwords }) => {
      await queryClient.invalidateQueries(passwordsTreeQueryOptions)
      toast.add({
        title: `Imported ${plural(folders, 'folder')} and ${plural(passwords, 'password')}`,
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

  const isEmpty = !tree.folders.length && !tree.passwords.length

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
            <DropdownMenuItem disabled={!unlocked} onClick={lockVault}>
              <LockIcon />
              Lock
              <DropdownMenuShortcut>
                <ShortcutKey id="passwords.lock" />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!unlocked}
              onClick={() => setMasterOpen(true)}
            >
              <KeyRoundIcon />
              Change master password…
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Passwords file (unencrypted)</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!unlocked || importFile.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              Import JSON…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!unlocked || isEmpty}
              onClick={() => {
                download(tree)
                toast.add({
                  title: 'Exported unencrypted',
                  description:
                    'The file holds every password in clear: keep it safe, delete it when done.',
                  type: 'warning',
                })
              }}
            >
              <DownloadIcon />
              Export JSON
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
              Settings…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
              <HistoryIcon />
              {ASSISTANT_NAME} history…
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
      <ChangeMasterDialog open={masterOpen} onOpenChange={setMasterOpen} />
      <AssistantHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
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
