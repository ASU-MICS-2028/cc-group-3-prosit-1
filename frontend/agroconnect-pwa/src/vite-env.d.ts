/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_AUTH_URL?: string
  readonly VITE_ADMIN_URL?: string
  readonly VITE_PAYMENTS_URL?: string
  readonly VITE_ADVICE_URL?: string
  readonly VITE_LISTINGS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
