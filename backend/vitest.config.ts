import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The first test in each file builds the migrated, seeded PGlite template (WASM start, migration,
    // scrypt hashes for the demo accounts), which takes several seconds on a CI runner.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
