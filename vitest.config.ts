import { defineConfig } from 'vitest/config'

// Only the app's own tests. supabase/functions tests run under Deno (`deno test`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
