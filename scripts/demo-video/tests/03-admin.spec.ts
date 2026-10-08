import { test } from '@playwright/test'
import { dismissServiceWorker, dwell, staffSignIn, tapTab } from './_helpers'

test('admin walkthrough', async ({ page }) => {
  await dismissServiceWorker(page)
  await dwell(page, 1500)

  await staffSignIn(page, 'ADM-001', 'admin-test-pass')
  await dwell(page, 3500) // Overview with stats

  // Agents (Team) - approve any pending
  await tapTab(page, 'Agents')
  await dwell(page, 3000)

  const approve = page.getByRole('button', { name: /^Approve$/i }).first()
  if (await approve.isVisible().catch(() => false)) {
    await approve.click()
    await dwell(page, 2500)
  }

  // Switch to Coordinators view and show "Add a coordinator"
  const coordView = page.getByRole('button', { name: /Coordinators/i }).first()
  if (await coordView.isVisible().catch(() => false)) {
    await coordView.click()
    await dwell(page, 2000)
    const addCoord = page.getByRole('button', { name: /Add a coordinator/i }).first()
    if (await addCoord.isVisible().catch(() => false)) {
      await addCoord.click()
      await dwell(page, 2500)
      // Close/cancel - avoid actually creating 20 test coordinators per run
      const cancel = page.getByRole('button', { name: /^Cancel$|^Close$|^Back$/i }).first()
      if (await cancel.isVisible().catch(() => false)) await cancel.click()
      await dwell(page, 1200)
    }
  }

  // Activity: audit log + feedback inbox + crop checks (all on one scroll)
  await tapTab(page, 'Activity')
  await dwell(page, 4000)
  // Scroll to show more of the activity content
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' })).catch(() => {})
  await dwell(page, 2500)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {})
  await dwell(page, 1500)

  // Back to Overview to end on the dashboard
  await tapTab(page, 'Overview')
  await dwell(page, 3000)
})
