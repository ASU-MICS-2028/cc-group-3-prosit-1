import { test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dismissServiceWorker, dwell, staffSignIn, tapTab, signOut, pressPin } from './_helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PHOTO = path.resolve(__dirname, '..', 'assets', 'sample-crop.jpg')

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 5.6700, longitude: -0.0170 }, // Ashaiman
  locale: 'en-GB',
})

test('field agent walkthrough', async ({ page }) => {
  await dismissServiceWorker(page)
  await dwell(page, 1500)

  // Sign in as approved agent AG-0001
  await staffSignIn(page, 'AG-0001', 'agent-test-pass')
  await dwell(page, 3000) // Home with gauge

  // Register a new farmer
  await tapTab(page, 'Register')
  await dwell(page, 2000)

  // If a "resume unfinished" prompt appears, start new
  const resumeNo = page.getByRole('button', { name: /Start new/i }).first()
  if (await resumeNo.isVisible().catch(() => false)) {
    await resumeNo.click()
    await dwell(page, 800)
  }

  // Step 1: Who
  const uniquePhone = '024' + String(Math.floor(1000000 + Math.random() * 8999999))
  await page.locator('#f-name').fill('Demo Kofi Mensah')
  await dwell(page, 400)
  await page.locator('#f-phone').fill(uniquePhone)
  await dwell(page, 400)
  // Pick a language pill
  await page.locator('.pill').filter({ hasText: /Twi/i }).first().click().catch(() => {})
  await dwell(page, 400)
  await page.getByRole('button', { name: /^Next$/i }).click()
  await dwell(page, 1500)

  // Step 2: Farm
  await page.locator('#f-community').fill('Ashaiman')
  await dwell(page, 300)
  await page.locator('#f-region').selectOption({ label: 'Greater Accra' }).catch(async () => {
    // Fallback: pick first non-empty option
    await page.locator('#f-region').selectOption({ index: 1 })
  })
  await dwell(page, 300)
  await page.locator('#f-size').fill('2.5')
  await dwell(page, 400)
  // Tap a crop or two
  const crops = page.locator('.crop-grid button, .crop-grid [role="button"]')
  const cropCount = await crops.count()
  if (cropCount > 0) {
    await crops.nth(0).click()
    await dwell(page, 200)
    if (cropCount > 1) await crops.nth(1).click()
  }
  await dwell(page, 800)
  await page.getByRole('button', { name: /^Next$/i }).click()
  await dwell(page, 1500)

  // Step 3 may be About (profile) in a 4-step flow. Skip-forward until Proof shows.
  // Keep tapping Next until we see Photo or Save & register next appears.
  for (let i = 0; i < 2; i++) {
    const save = page.getByRole('button', { name: /Save & register next|^Save$/i }).first()
    if (await save.isVisible().catch(() => false)) break
    const next = page.getByRole('button', { name: /^Next$/i }).first()
    if (await next.isVisible().catch(() => false)) {
      await next.click()
      await dwell(page, 1200)
    } else break
  }

  // Upload photo (hidden file input inside the label)
  const fileInput = page.locator('input[type="file"]').first()
  if (await fileInput.count()) {
    await fileInput.setInputFiles(PHOTO)
    await dwell(page, 2000) // compression + thumb
  }

  // Get GPS
  const gpsBtn = page.getByRole('button', { name: /Get location|Try again/i }).first()
  if (await gpsBtn.isVisible().catch(() => false)) {
    await gpsBtn.click()
    await dwell(page, 3000)
  }

  // Consent checkbox
  const consent = page.locator('.consent input[type="checkbox"]').first()
  if (await consent.isVisible().catch(() => false)) {
    await consent.check().catch(() => {})
    await dwell(page, 600)
  }

  // Save
  const save = page.getByRole('button', { name: /^Save$/i }).first()
  if (await save.isVisible().catch(() => false)) {
    await save.click()
    await dwell(page, 2500)
  }

  // Farmers list
  await tapTab(page, 'Farmers')
  await dwell(page, 3500)

  // Sign out and show the pending-agent flow briefly
  await signOut(page)
  await dwell(page, 1500)

  // Pending agent: sign-in attempt lands on "Waiting for approval"
  await page.getByRole('button', { name: /I work with AgroConnect/i }).click()
  await page.locator('#s-id').fill('+233200000099')
  await page.locator('#s-pass').fill('pending-test-pass')
  await dwell(page, 600)
  await page.getByRole('button', { name: /^Sign in$/i }).first().click()
  await page.waitForLoadState('networkidle')
  await dwell(page, 4000) // show the "Waiting for approval" screen
})
