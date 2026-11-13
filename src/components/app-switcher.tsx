import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import {
  Command,
  CommandEmpty,
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
import { APPS } from '@/lib/apps'
import type { AppPath } from '@/lib/apps'

export function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** A dialog, menu or popover is open: the page's keys are off. */
export function popupOpen() {
  return !!document.querySelector(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
  )
}

/**
 * `f` on every app: a command palette (the same Dialog + Command as the
 * global search, `z`) listing the apps. Type to filter and Enter, move with
 * ↑/↓ (or Ctrl+J / Ctrl+K), or press an app's number. Mounted once, in the
 * root layout, with its own key listener (off while typing or while any
 * dialog / menu is open).
 */
export function AppSwitcher() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (l) => l.pathname })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = APPS.find((app) => pathname.startsWith(app.path))
  // Highlighted row: starts on the next app, the likeliest pick.
  const [value, setValue] = useState('')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'f' || isTyping(e.target) || popupOpen()) return
      e.preventDefault()
      const index = APPS.findIndex((app) => app === current)
      setValue(APPS[(index + 1) % APPS.length].name)
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current])

  // Navigated once the dialog is gone, so it doesn't hand focus back to the
  // page being left.
  const picked = useRef<AppPath | null>(null)
  const pick = (path: AppPath) => {
    picked.current = path === current?.path ? null : path
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return
        setQuery('')
        const path = picked.current
        picked.current = null
        if (path) setTimeout(() => void navigate({ to: path }))
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Switch app</DialogTitle>
        <DialogDescription>Pick the app to go to.</DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-sm"
        showCloseButton={false}
      >
        <Command value={value} onValueChange={setValue}>
          <CommandInput
            placeholder="Go to app…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              // 1-9: that app straight away (app names have no digits).
              const n = Number(e.key)
              if (!Number.isInteger(n) || n < 1 || n > APPS.length) return
              e.preventDefault()
              pick(APPS[n - 1].path)
            }}
          />
          <CommandList>
            <CommandEmpty>No app by that name.</CommandEmpty>
            {APPS.map((app, i) => (
              <CommandItem
                key={app.path}
                value={app.name}
                onSelect={() => pick(app.path)}
              >
                <app.icon />
                {app.name}
                {app === current && (
                  <span className="text-xs text-muted-foreground">current</span>
                )}
                <CommandShortcut>{i + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
