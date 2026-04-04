/// <reference types="vite/client" />

import type { AnankeApi } from '../preload/index'

declare global {
  interface Window {
    ananke: AnankeApi
  }
}

export {}
