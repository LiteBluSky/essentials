import { toast } from '@/components/ui/toast'
import type { Password } from '@/db/schema'
import { siteHref } from '@/lib/passwords/tree'
import { openSecret } from '@/lib/passwords/vault'

// What a password's row menu, its details and the keys (`u`, `c`, `O`) do.

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${what} copied`, type: 'success', timeout: 2000 })
  } catch {
    toast.add({
      title: `Couldn't copy the ${what.toLowerCase()}`,
      type: 'error',
    })
  }
}

export function copyUsername(password: Password) {
  if (!password.username) {
    toast.add({ title: 'No username saved', type: 'warning', timeout: 2000 })
    return
  }
  void copy(password.username, 'Username')
}

/** Opened only for the copy, never kept. */
export function copyPassword(password: Password) {
  let clear: string
  try {
    clear = openSecret(password.secret).password
  } catch (error) {
    toast.add({
      title: "Couldn't open it",
      description: error instanceof Error ? error.message : String(error),
      type: 'error',
    })
    return
  }
  if (!clear) {
    toast.add({ title: 'No password saved', type: 'warning', timeout: 2000 })
    return
  }
  void copy(clear, 'Password')
}

/** The site in a new tab. */
export function openSite(password: Password) {
  const href = siteHref(password.url)
  if (!href) {
    toast.add({ title: 'No website saved', type: 'warning', timeout: 2000 })
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}
