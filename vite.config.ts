/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: ['es2021', 'safari14'], minify: !process.env.TAURI_DEBUG },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
