import { toast } from '@/components/ui/toast'
import type { Password } from '@/db/schema'
import { useOpenReference } from '@/hooks/use-open-reference'
import { siteBookmark, siteHref } from '@/lib/passwords/tree'
import { resolveReference } from '@/server/search.functions'
import { openSecret } from '@/lib/passwords/vault'

// What a password's row menu, its details and the keys (`u`, `c`, `O`) do.
// The website is a URL or a `@bookmark(Name#id)` reference.

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

/** Opens the site in a new tab: the URL, or the bookmark the website
 * field points at (its current URL; a toast if it's gone). */
export function useOpenSite() {
  const openReference = useOpenReference()
  return (password: Password) => {
    const bookmark = siteBookmark(password.url)
    if (bookmark) {
      void openReference(bookmark)
      return
    }
    const href = siteHref(password.url)
    if (!href) {
      toast.add({ title: 'No website saved', type: 'warning', timeout: 2000 })
      return
    }
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}

/** Copies the website: the URL, or the URL of the bookmark it points at. */
export async function copySite(password: Password) {
  const bookmark = siteBookmark(password.url)
  if (!bookmark) {
    void copy(password.url, 'Website')
    return
  }
  const found = await resolveReference({
    data: { app: 'bookmarks', id: bookmark.id, name: bookmark.name },
  }).catch(() => null)
  if (!found?.url) {
    toast.add({ title: `Couldn't find “${bookmark.name}”`, type: 'error' })
    return
  }
  void copy(found.url, 'Website')
}
