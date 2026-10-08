import { test } from '@playwright/test'
import { caption, dismissServiceWorker, dwell, saveCaptions, staffSignIn, startCaptions, tapTab } from './_helpers'

test('admin walkthrough', async ({ page }) => {
  startCaptions('admin')
  caption('Ama is the programme admin. Her dashboard covers every association.')
  await dismissServiceWorker(page)
  await dwell(page, 1500)
  await staffSignIn(page, 'ADM-001', 'admin-test-pass')
  await dwell(page, 3500)
  await page.mouse.wheel(0, 500)
  await dwell(page, 2500)

  caption('New field agents request an account themselves. They wait here until an admin approves them and gives them an ID.')
  await tapTab(page, 'Agents')
  await dwell(page, 3500)
  await page.getByRole('button', { name: /^Approved$/ }).click()
  await dwell(page, 3000)

  caption('Admins add coordinators, and can suspend or reinstate any staff account.')
  await page.getByRole('button', { name: /^Coordinators$/ }).click()
  await dwell(page, 3500)

  caption('Every farmer registered by every agent, searchable from one list.')
  await tapTab(page, 'Farmers')
  await dwell(page, 4000)

  caption('The database writes an audit entry for every change: who did it, what changed, and when.')
  await tapTab(page, 'Activity')
  await dwell(page, 4000)
  await page.mouse.wheel(0, 500)
  await dwell(page, 3000)
  saveCaptions()
})
