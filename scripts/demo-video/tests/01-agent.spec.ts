import { test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caption, dismissServiceWorker, dwell, saveCaptions, staffSignIn, startCaptions, tapTab } from './_helpers'

const PHOTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'maize-farm.jpg')

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 5.6941, longitude: -0.0297, accuracy: 8 }, // Ashaiman
})

test('field agent walkthrough', async ({ page, context }) => {
  startCaptions('agent')
  caption('Farmers and staff use one app. It installs from the browser and works in English, Twi and Ewe.')
  await dismissServiceWorker(page)
  await dwell(page, 3500)

  caption('Efua is a field agent. She signs in with her staff ID, then sets a 6-digit PIN so she can open the app with no signal.')
  await staffSignIn(page, 'AG-0001', 'agent-test-pass')
  caption("Her home screen counts today's registrations and anything still waiting to send.")
  await dwell(page, 4000)

  caption('Registering a farmer takes four short steps. Step 1: who the farmer is, their language and gender.')
  await tapTab(page, 'Register')
  const startNew = page.getByRole('button', { name: /Start new/i }).first()
  if (await startNew.isVisible().catch(() => false)) await startNew.click()
  await dwell(page, 1500)
  await page.locator('#f-name').pressSequentially('Kofi Mensah', { delay: 60 })
  await page.locator('#f-phone').pressSequentially('024' + String(1000000 + Math.floor(Math.random() * 8999999)), { delay: 60 })
  await page.locator('.pill').filter({ hasText: /^Twi$/ }).first().click()
  await dwell(page, 500)
  await page.locator('.pill').filter({ hasText: /^Male$/ }).first().click()
  await dwell(page, 1500)
  await page.getByRole('button', { name: /^Next$/ }).click()

  caption('Step 2: the farm. Community, region, size and the crops grown.')
  await dwell(page, 1500)
  await page.locator('#f-community').pressSequentially('Ashaiman', { delay: 60 })
  await page.locator('#f-region').selectOption({ label: 'Greater Accra' })
  await page.locator('#f-size').fill('2.5')
  await dwell(page, 600)
  const crops = page.locator('.crop-grid button')
  await crops.nth(0).click()
  await dwell(page, 400)
  await crops.nth(1).click()
  await dwell(page, 1500)
  await page.getByRole('button', { name: /^Next$/ }).click()

  caption('Step 3 is optional: phone access, income and the support the farmer needs. This is the data the programme reports on.')
  await dwell(page, 2000)
  for (const chip of ['Basic phone', 'SMS', 'Crops', 'Sometimes', 'Seeds and fertiliser', 'Buyers and markets']) {
    await page.getByRole('button', { name: chip, exact: true }).first().click()
    await dwell(page, 700)
  }
  await dwell(page, 1000)
  await page.getByRole('button', { name: /^Next$/ }).click()

  caption('Step 4: proof. A photo, shrunk on the phone to about 100 KB, the GPS location of the farm, and the farmer’s consent.')
  await dwell(page, 1500)
  await page.locator('input[type="file"]').first().setInputFiles(PHOTO)
  await dwell(page, 2500)
  await page.getByRole('button', { name: /Get location|Try again/i }).first().click()
  await dwell(page, 2500)
  await page.locator('.consent input[type="checkbox"]').first().check()
  await dwell(page, 1500)

  caption('No signal in the field? Saving still works. The record waits in an outbox on the phone.')
  await context.setOffline(true)
  await dwell(page, 2500)
  await page.getByRole('button', { name: /^Save$/ }).click()
  await dwell(page, 4500)

  caption('When signal returns, the outbox sends on its own. No button to press, and no duplicate if it is sent twice.')
  await context.setOffline(false)
  await page.getByText(/^Sent$/).first().waitFor({ timeout: 30_000 }).catch(() => {})
  await dwell(page, 3500)

  caption("Each farmer's record shows the photo, GPS, consent, and later the agent's visits and payments.")
  await page.locator('.farmer-row, .list-item, li button').filter({ hasText: 'Kofi Mensah' }).first().click()
  await dwell(page, 3000)
  await page.mouse.wheel(0, 500)
  await dwell(page, 3000)
  saveCaptions()
})
