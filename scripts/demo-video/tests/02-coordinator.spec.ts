import { test } from '@playwright/test'
import { caption, dismissServiceWorker, dwell, saveCaptions, staffSignIn, startCaptions, tapTab } from './_helpers'

test('coordinator walkthrough', async ({ page }) => {
  startCaptions('coordinator')
  caption('Kwame coordinates the Ashaiman Urban Farmers Association. He signs in the same way.')
  await dismissServiceWorker(page)
  await dwell(page, 1500)
  await staffSignIn(page, 'CO-001', 'coord-test-pass')
  await dwell(page, 1500)

  caption('Stats covers his association: farmers registered, by day, community, crop and language. Export CSV feeds reports.')
  await tapTab(page, 'Stats')
  await dwell(page, 3500)
  await page.mouse.wheel(0, 600)
  await dwell(page, 3500)

  caption("He records today's market prices. Farmers see them on Home and Market the next time they sync.")
  await tapTab(page, 'More')
  await page.getByRole('button', { name: /Prices & advice/ }).click()
  await dwell(page, 2000)
  await page.locator('.crop-grid button').first().click()
  await page.locator('#price-value').pressSequentially('6.50', { delay: 80 })
  await dwell(page, 800)
  await page.getByRole('button', { name: /^Save price$/ }).click()
  await dwell(page, 3000)

  caption('Advice cards are published from the same screen, so the content stays current without an app update.')
  await page.getByRole('heading', { name: 'Publish advice', exact: true }).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  await dwell(page, 2500)
  await page.getByRole('heading', { name: 'Published advice', exact: true }).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await dwell(page, 3500)

  caption('Farmers on basic phones can dial a USSD code to ask for a visit. Requests land here for the coordinator to assign.')
  await page.getByRole('button', { name: /Back/ }).first().click()
  await page.getByRole('button', { name: /Requests from farmers/ }).click()
  await dwell(page, 4500)
  saveCaptions()
})
