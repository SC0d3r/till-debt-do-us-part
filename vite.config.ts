import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
  },
  server: {
    hmr: { overlay: true },
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  },
})
