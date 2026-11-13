import { useMutation, useQuery } from '@tanstack/react-query'
import { CloudIcon, HardDriveIcon, UserIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { isTyping, popupOpen } from '@/components/app-switcher'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import {
  databasesQueryOptions,
  switchDatabase,
} from '@/server/databases.functions'

const OPEN_EVENT = 'profile-switcher:open'

/** Opens the profile switcher (the header's user button). */
function openProfileSwitcher() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** The header's user icon (every app): opens the profile switcher, `p`. */
export function ProfileButton() {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Switch profile"
      title="Switch profile (p)"
      onClick={openProfileSwitcher}
    >
      <UserIcon />
    </Button>
  )
}

/**
 * `p` (or the header's user icon) on every app: a command palette, like `f`
 * and `z`, listing the databases — Local and those added in Settings →
 * Database — to switch every app to one (the page then reloads). Adding and
 * removing them stays in Settings. Mounted once, in the root layout, with its
 * own key listener (off while typing or while any dialog / menu is open; a
 * tree's `p` pastes first when something is cut).
 */
export function ProfileSwitcher() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [value, setValue] = useState('')
  const databases = useQuery({ ...databasesQueryOptions, enabled: open })
  const view = databases.data

  const profiles = view
    ? [
        { id: null, name: 'Local', detail: 'This server' },
        ...view.databases.map((d) => ({
          id: d.id,
          name: d.name,
          detail: d.url.replace(/^\w+:\/\//, ''),
        })),
      ]
    : []

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'p' || isTyping(e.target) || popupOpen()) return
      e.preventDefault()
      setOpen(true)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  // Highlight the next profile, the likeliest pick (like `f`).
  const ready = !!view
  useEffect(() => {
    if (!open || !view) return
    const index = profiles.findIndex((p) => p.id === view.activeId)
    setValue(rowValue(profiles[(index + 1) % profiles.length]))
    // Only when it opens / the list arrives.
  }, [open, ready])

  const switchTo = useMutation({
    mutationFn: (id: number | null) => switchDatabase({ data: { id } }),
    // Every app's data changed: start over from the server.
    onSuccess: () => window.location.reload(),
    onError: (error) =>
      toast.add({
        title: "Couldn't switch profile",
        description: error.message,
        type: 'error',
      }),
  })

  const pick = (id: number | null) => {
    if (switchTo.isPending) return
    if (id === view?.activeId) setOpen(false)
    else switchTo.mutate(id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!switchTo.isPending) setOpen(next)
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setQuery('')
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Switch profile</DialogTitle>
        <DialogDescription>
          Pick the database every app reads and writes.
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-sm"
        showCloseButton={false}
      >
        <Command value={value} onValueChange={setValue}>
          <CommandInput
            placeholder="Switch profile…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              // 1-9: that profile straight away.
              const n = Number(e.key)
              if (!Number.isInteger(n) || n < 1 || n > profiles.length) return
              e.preventDefault()
              pick(profiles[n - 1].id)
            }}
          />
          <CommandList>
            {databases.error ? (
              <p className="py-6 text-center text-sm text-destructive">
                {databases.error.message}
              </p>
            ) : !view ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <>
                <CommandEmpty>No profile by that name.</CommandEmpty>
                <CommandGroup
                  heading={
                    view.databases.length
                      ? undefined
                      : 'Add Turso databases in Settings → Database'
                  }
                >
                  {profiles.map((profile, i) => (
                    <CommandItem
                      key={profile.id ?? 'local'}
                      value={rowValue(profile)}
                      disabled={switchTo.isPending}
                      onSelect={() => pick(profile.id)}
                    >
                      {switchTo.isPending &&
                      switchTo.variables === profile.id ? (
                        <Spinner />
                      ) : profile.id === null ? (
                        <HardDriveIcon />
                      ) : (
                        <CloudIcon />
                      )}
                      <span className="truncate">{profile.name}</span>
                      {profile.id === view.activeId && (
                        <span className="text-xs text-muted-foreground">
                          current
                        </span>
                      )}
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {profile.detail}
                      </span>
                      <CommandShortcut className="ml-0">
                        {i + 1}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/** Unique per row (names may repeat), still matching a search by name. */
function rowValue(profile: { id: number | null; name: string }) {
  return `${profile.name} ${profile.id ?? 'local'}`
}
