import { Page, expect } from '@playwright/test'

/** Pause so the video shows the screen long enough to read. */
export async function dwell(page: Page, ms = 1800) {
  await page.waitForTimeout(ms)
}

export async function dismissServiceWorker(page: Page) {
  // Clear SW + storage so each run starts fresh (first-time PIN prompt, etc).
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      if (regs) for (const r of regs) await r.unregister()
    } catch {}
    try {
      const dbs = (await (indexedDB as any).databases?.()) || []
      for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
    } catch {}
    try { localStorage.clear(); sessionStorage.clear() } catch {}
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
}

/** Click a bottom-nav tab by its visible label (bottom-nav .nav-tab). */
export async function tapTab(page: Page, label: RegExp | string) {
  const re = typeof label === 'string' ? new RegExp(`^${label}$`, 'i') : label
  const tab = page.locator('.bottom-nav .nav-tab', { hasText: re }).first()
  // Scroll back to top first - some long lists push content over the nav.
  await page.evaluate(() => window.scrollTo({ top: 0 })).catch(() => {})
  // `force` bypasses the pointer-events check: the bottom-nav is always on top
  // visually but auto-layout sometimes reports an overlap during scroll settling.
  await tab.click({ force: true })
  await page.waitForLoadState('networkidle').catch(() => {})
}

/** Sign in as staff (admin/coordinator/agent) and set up PIN 123456 if asked. */
export async function staffSignIn(page: Page, id: string, password: string) {
  await page.getByRole('button', { name: /I work with AgroConnect/i }).click()
  await page.locator('#s-id').fill(id)
  await page.locator('#s-pass').fill(password)
  await dwell(page, 800)
  await page.getByRole('button', { name: /^Sign in$/i }).first().click()
  await page.waitForLoadState('networkidle')
  await maybeSetPin(page, '123456')
}

export async function maybeSetPin(page: Page, pin: string) {
  await dwell(page, 1800)
  if (!(await page.locator('.pin-keys').first().isVisible().catch(() => false))) return
  // Choose
  await pressPin(page, pin)
  await dwell(page, 1200)
  // Confirm step: PinPad is re-mounted with a new key; selector is still valid.
  if (await page.locator('.pin-keys').first().isVisible().catch(() => false)) {
    await pressPin(page, pin)
  }
  await page.waitForLoadState('networkidle')
  await dwell(page, 1200)
}

export async function pressPin(page: Page, pin: string) {
  // Match exactly: `.pin-key:not(.pin-key-delete)` filtered by trimmed text.
  for (const d of pin) {
    const key = page.locator(`.pin-key:not(.pin-key-delete)`, { hasText: new RegExp(`^${d}$`) }).first()
    await key.waitFor({ state: 'visible', timeout: 10_000 })
    await key.click({ force: true })
    await page.waitForTimeout(220)
  }
}

export async function farmerSignInWithPin(page: Page, phone: string, pin: string) {
  await page.getByRole('button', { name: /I'm a farmer/i }).click()
  await page.locator('#a-phone').fill(phone)
  await dwell(page, 600)
  // Button text is "Send code"
  await page.getByRole('button', { name: /Send code/i }).first().click()
  await page.waitForLoadState('networkidle')
  await dwell(page, 1200)
  await pressPin(page, pin)
  await page.waitForLoadState('networkidle')
}

export async function signOut(page: Page) {
  // The top user-bar has a Sign out button
  const btn = page.getByRole('button', { name: /^Sign out$/i }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await dwell(page, 500)
    // Confirm dialog
    const confirm = page.locator('button').filter({ hasText: /^Sign out$/i }).last()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await page.waitForLoadState('networkidle')
  }
}
