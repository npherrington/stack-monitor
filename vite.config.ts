import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web', import.meta.url)) },
  },
  // Relative, so the built page loads its files from wherever it's opened, a file in an app
  // bundle included. The router keeps its routes in the hash for the same reason.
  base: './',
  // The page loads from 127.0.0.1, so bundle size costs a parse, not a download.
  build: { outDir: 'dist', chunkSizeWarningLimit: 1024 },
})
