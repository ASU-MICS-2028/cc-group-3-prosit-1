import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The first test in each file builds the migrated, seeded PGlite template (WASM start, migration,
    // scrypt hashes for the demo accounts), which takes several seconds on a CI runner.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // With TEST_DATABASE_URL, every test app clones its own Postgres database and keeps a pool open, so
    // running every file at once exhausts the server's default max_connections (100). Two workers is
    // enough to stay well under it without losing wall-clock time.
    maxWorkers: 2,
  },
})
