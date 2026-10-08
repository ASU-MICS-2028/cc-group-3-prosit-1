import { test } from '@playwright/test'
import { dismissServiceWorker, dwell, farmerSignInWithPin, tapTab } from './_helpers'

test('farmer walkthrough', async ({ page }) => {
  await dismissServiceWorker(page)
  await dwell(page, 2000) // role-choice screen

  // Farmer sign-in with demo account - direct PIN, no OTP.
  await farmerSignInWithPin(page, '0200000010', '1234')
  await dwell(page, 3000) // Home: weather, greeting

  // Market: real/sample prices with trend arrows
  await tapTab(page, 'Market')
  await dwell(page, 3500)

  // Wallet: balance + history + test-mode payment
  await tapTab(page, 'Wallet')
  await dwell(page, 3000)

  const payBtn = page.getByRole('button', { name: /Pay with mobile money/i }).first()
  if (await payBtn.isVisible().catch(() => false)) {
    await payBtn.click()
    await dwell(page, 1500)
    const amount = page.locator('input[type="number"], input[inputmode="numeric"]').first()
    if (await amount.isVisible().catch(() => false)) {
      await amount.fill('25')
      await dwell(page, 1000)
      const cont = page.getByRole('button', { name: /^Continue$/i }).first()
      if (await cont.isVisible().catch(() => false)) {
        await cont.click()
        await dwell(page, 3000) // saved note
      }
    }
    const done = page.getByRole('button', { name: /^Done$/i }).first()
    if (await done.isVisible().catch(() => false)) await done.click()
    await dwell(page, 2500) // back to wallet with pending payment
  }

  // Advice: crop check
  await tapTab(page, 'Advice')
  await dwell(page, 3000)

  // Me: profile + language
  await tapTab(page, 'Me')
  await dwell(page, 3000)
})
