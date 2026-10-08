import { test } from '@playwright/test'
import { caption, dismissServiceWorker, dwell, farmerSignInWithPin, saveCaptions, startCaptions, tapTab } from './_helpers'

test('farmer walkthrough', async ({ page }) => {
  startCaptions('farmer')
  caption('Akosua is a farmer. She signs in with her phone number and a 4-digit PIN. New farmers get a code by SMS.')
  await dismissServiceWorker(page)
  await dwell(page, 1500)
  await farmerSignInWithPin(page, '0200000010', '1234')

  caption("Home shows today's weather for her community and today's prices. Listen reads them aloud for farmers who prefer not to read.")
  await dwell(page, 5000)
  await page.mouse.wheel(0, 400)
  await dwell(page, 2500)

  caption('Market: the prices her coordinator recorded, with the change since last week.')
  await tapTab(page, 'Market')
  await dwell(page, 5000)

  caption('Wallet: pay or receive by mobile money. Payments run in test mode, so no real money moves.')
  await tapTab(page, 'Wallet')
  await dwell(page, 3000)
  await page.getByRole('button', { name: /Pay with mobile money/i }).click()
  await dwell(page, 1500)
  await page.locator('#pay-amount').pressSequentially('5', { delay: 80 })
  await dwell(page, 1500)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await dwell(page, 4000)
  const done = page.getByRole('button', { name: /^Done$/ }).first()
  if (await done.isVisible().catch(() => false)) await done.click()
  await dwell(page, 2000)

  caption('Advice: short cards from the programme, each with Listen. She can also send a crop photo to her agent for a check.')
  await tapTab(page, 'Advice')
  await dwell(page, 5000)

  caption('Me: the farm profile her field agent registered, and the consent she gave.')
  await tapTab(page, 'Me')
  await dwell(page, 3000)
  await page.mouse.wheel(0, 500)
  await dwell(page, 3000)

  caption('She can switch the whole app to Twi or Ewe at any time.')
  await page.locator('.pill').filter({ hasText: /^Twi$/ }).first().click()
  await dwell(page, 2000)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await dwell(page, 4000)
  saveCaptions()
})
