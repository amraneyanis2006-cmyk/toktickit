/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    // jsdom component tests time out at the 5 s default when every core runs a
    // worker on a laptop; a longer timeout and two workers make one normal run
    // reliable (Issue #62). Config only - no test edited.
    testTimeout: 15000,
    maxWorkers: 2,
  },
})
