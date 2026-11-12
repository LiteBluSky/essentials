import {
  EllipsisVerticalIcon,
  HistoryIcon,
  MonitorDownIcon,
  SettingsIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AssistantHistoryDialog } from '@/components/assistant-history-dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { useInstallApp } from '@/hooks/use-install-app'
import { ASSISTANT_NAME } from '@/lib/assistant'

// The Chat app's ⋮ menu: settings, the assistant history (chat turns and
// their cost are in it too) and installing the app.
export function ChatMenu({
  settingsOpen,
  onSettingsOpenChange,
}: {
  settingsOpen: boolean
  onSettingsOpenChange: (open: boolean) => void
}) {
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
            <DropdownMenuItem onClick={() => onSettingsOpenChange(true)}>
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
      <SettingsDialog open={settingsOpen} onOpenChange={onSettingsOpenChange} />
      <AssistantHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  )
}
