import { defineConfig, devices } from '@playwright/test'

// Record each role flow to its own video on an Android-sized phone; build-video.sh puts it
// beside the captions in a 1280x720 frame.
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
    userAgent: devices['Pixel 5'].userAgent, // farmers and agents in Ghana are mostly on Android
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    video: {
      mode: 'on',
      // Match the viewport: a larger size does not add detail, it pads the frame.
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
