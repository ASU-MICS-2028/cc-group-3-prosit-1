import { defineConfig, devices } from '@playwright/test'

// Record each role flow to its own video. Mobile viewport 390x844 (iPhone 13-ish),
// scaled up to 1280x720 later via ffmpeg so text stays legible.
export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1, // sequential - roles share no state but recordings are heavy
  reporter: [['list']],
  use: {
    baseURL: 'https://app.agroconnect.space',
    viewport: { width: 412, height: 820 }, // Pixel-5-ish portrait
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    video: {
      mode: 'on',
      // Match viewport pixel dimensions so the whole frame is page content.
      size: { width: 412, height: 820 },
    },
    // Live service worker/IndexedDB can cause stale state between runs; isolate storage.
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    {
      name: 'chromium',
      // No device spread - top-level `use` config above owns viewport/video.
      // Spreading Desktop Chrome here was clobbering viewport, leaving the
      // page rendered in a tiny band at the top of each recorded frame.
      use: {},
    },
  ],
})
