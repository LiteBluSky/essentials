import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

import pkg from './package.json' with { type: 'json' }

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Shown in the footer (`APP_VERSION` in src/lib/config.ts).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      // Phone reminders (ntfy): checks for due tasks every minute.
      plugins: ['./src/server/reminders.plugin.ts'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
