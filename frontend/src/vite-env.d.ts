/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEFAULT_NAMESPACE?: string
  readonly VITE_DEFAULT_HF_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
