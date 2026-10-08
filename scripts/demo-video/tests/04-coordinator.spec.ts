import { test } from '@playwright/test'
import { dismissServiceWorker, dwell, staffSignIn, tapTab } from './_helpers'

test('coordinator walkthrough', async ({ page }) => {
  await dismissServiceWorker(page)
  await dwell(page, 1500)

  await staffSignIn(page, 'CO-001', 'coord-test-pass')
  await dwell(page, 3500) // Home

  // Stats (association-scoped)
  await tapTab(page, 'Stats')
  await dwell(page, 4000)

  // Farmers list
  await tapTab(page, 'Farmers')
  await dwell(page, 3500)

  // More → Crop checks under coordinator
  await tapTab(page, 'More')
  await dwell(page, 2500)
})
