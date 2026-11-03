// Service worker: makes the app installable and readable offline.
// - Hashed build assets (/assets/*): cache first (they never change).
// - Everything else (the page, server-function reads, icons): network first,
//   falling back to the last cached copy. Each app's page is server-rendered
//   with all its data in it, so offline you get it as it was last loaded
//   (read-only: saving needs the server).
// `/` only redirects to the first app, so redirected responses aren't cached
// (a browser refuses them for navigations) and pages are cached by app path.
const CACHE = 'app-v2'
const PAGES = ['/bookmarks', '/notes']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PAGES))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(request)
        if (hit) return hit
        if (request.mode === 'navigate') {
          const page = await caches.match(PAGES[0])
          if (page) return page
        }
        return Response.error()
      }),
  )
})
