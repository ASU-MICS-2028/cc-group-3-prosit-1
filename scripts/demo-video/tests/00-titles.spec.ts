import { test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', 'assets', 'titles')
mkdirSync(OUT, { recursive: true })

const CARDS: Array<{ file: string; title: string; subtitle: string; accent: string }> = [
  { file: 'intro.png', title: 'AgroConnect Ghana', subtitle: 'Live System Walkthrough\napp.agroconnect.space', accent: '#1F3D2B' },
  { file: 'farmer.png', title: 'Farmer', subtitle: '0200000010 · PIN 1234\nMarket · Wallet · Advice', accent: '#C9A227' },
  { file: 'agent.png', title: 'Field Agent', subtitle: 'AG-0001\nRegister farmers · Pending approval', accent: '#4A7C59' },
  { file: 'admin.png', title: 'Administrator', subtitle: 'ADM-001\nApprove staff · Audit · Feedback', accent: '#8B5E34' },
  { file: 'coord.png', title: 'Coordinator', subtitle: 'CO-001\nAssociation stats · Farmers', accent: '#E07856' },
  { file: 'outro.png', title: 'End of walkthrough', subtitle: 'github.com/agroconnect\napp.agroconnect.space', accent: '#1F3D2B' },
]

test.use({ viewport: { width: 780, height: 1688 }, deviceScaleFactor: 1 })

test('generate title cards', async ({ page }) => {
  for (const card of CARDS) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;background:${card.accent};color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif}
      .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:40px}
      .logo{font-size:28px;opacity:.85;letter-spacing:.2em;text-transform:uppercase;margin-bottom:24px}
      .title{font-size:92px;font-weight:800;line-height:1.05;margin:0 0 32px}
      .sub{font-size:40px;line-height:1.35;opacity:.92;white-space:pre-line}
      .bar{width:60%;height:6px;background:rgba(255,255,255,.5);border-radius:3px;margin-top:48px}
    </style></head><body><div class="wrap">
      <div class="logo">AgroConnect Ghana</div>
      <h1 class="title">${card.title}</h1>
      <div class="sub">${card.subtitle}</div>
      <div class="bar"></div>
    </div></body></html>`
    await page.setContent(html)
    await page.waitForLoadState('domcontentloaded')
    await page.screenshot({ path: path.join(OUT, card.file), fullPage: false })
  }
})
