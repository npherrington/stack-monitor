import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Relative, so the built page loads its files from wherever it's opened, a file in an app
  // bundle included.
  base: './',
  build: { outDir: 'dist' },
})
