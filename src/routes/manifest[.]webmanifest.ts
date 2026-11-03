import { createFileRoute } from '@tanstack/react-router'

import { APP_NAME } from '@/lib/config'

// Web app manifest (installable on Android / desktop, "Add to Home Screen"
// on iOS). Served from a route so the name follows VITE_APP_NAME.
export const Route = createFileRoute('/manifest.webmanifest')({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            name: APP_NAME,
            short_name: APP_NAME,
            description:
              'Bookmarks, notes and other simple essentials, in one place.',
            id: '/',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#ffffff',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
              {
                src: '/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
              { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
            ],
          },
          { headers: { 'Content-Type': 'application/manifest+json' } },
        ),
    },
  },
})
