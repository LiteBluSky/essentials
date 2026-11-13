/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json's version (`define` in vite.config.ts). */
declare const __APP_VERSION__: string
