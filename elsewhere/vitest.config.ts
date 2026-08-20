import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    // Playwright specs live in e2e/ and must not be collected by vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
