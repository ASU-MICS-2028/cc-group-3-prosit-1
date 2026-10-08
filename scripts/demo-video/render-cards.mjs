// Renders the intro and outro cards (1280x720) and, for each clip, one caption panel per caption
// (the area beside the phone), from build/captions/<clip>.json. build-video.sh stitches them.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(ROOT, 'build')
const [PANEL_W, H] = [880, 720]

const REPO = 'github.com/ASU-MICS-2028/cc-group-3-prosit-1'
const APP = 'app.agroconnect.space'
const RECORDED = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' })

const CLIPS = [
  { id: 'agent', role: 'Field agent', who: 'Efua · AG-0001', accent: '#C8F169' },
  { id: 'coordinator', role: 'Coordinator', who: 'Kwame · CO-001', accent: '#F2A07B' },
  { id: 'admin', role: 'Administrator', who: 'Ama · ADM-001', accent: '#E8C46A' },
  { id: 'farmer', role: 'Farmer', who: 'Akosua · 0200000010', accent: '#F5D96B' },
]

const fonts = ['onest-var.woff2', 'unbounded-var.woff2'].map((file) =>
  fs.readFileSync(path.join(ROOT, '..', '..', 'frontend', 'agroconnect-pwa', 'public', 'fonts', file)).toString('base64'),
)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const page = (body, width) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Onest; src: url(data:font/woff2;base64,${fonts[0]}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: Unbounded; src: url(data:font/woff2;base64,${fonts[1]}) format('woff2'); font-weight: 200 900; }
* { box-sizing: border-box; margin: 0; }
body { width: ${width}px; height: ${H}px; background: #1F3D2B; color: #F4EFE3; font-family: Onest, sans-serif; overflow: hidden; }
.kicker { font-size: 15px; letter-spacing: .18em; text-transform: uppercase; opacity: .7; }
h1 { font-family: Unbounded, sans-serif; font-weight: 600; }
.mono { font-family: ui-monospace, Menlo, monospace; }
</style></head><body>${body}</body></html>`

const card = (title, lines) =>
  page(
    `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 110px;gap:22px">
      <div class="kicker">AgroConnect Ghana · Group 3 Highlanders</div>
      <h1 style="font-size:60px;line-height:1.1">${esc(title)}</h1>
      <div style="width:120px;height:6px;border-radius:3px;background:#C8F169"></div>
      ${lines.map((l) => `<div style="font-size:26px;opacity:.9">${l}</div>`).join('')}
    </div>`,
    1280,
  )

const panel = (clip, text, index, total) =>
  page(
    `<div style="height:100%;display:flex;flex-direction:column;padding:64px 80px 52px 56px">
      <div class="kicker">AgroConnect Ghana · live walkthrough</div>
      <div style="margin-top:22px;display:flex;align-items:center;gap:16px">
        <span style="background:${clip.accent};color:#1F3D2B;font-weight:700;font-size:22px;padding:8px 18px;border-radius:999px">${clip.role}</span>
        <span style="font-size:22px;opacity:.85">${esc(clip.who)}</span>
      </div>
      <div style="flex:1;display:flex;align-items:center">
        <p style="font-size:38px;line-height:1.32;font-weight:500">${esc(text)}</p>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:22px">
        ${Array.from({ length: total }, (_, i) => `<span style="flex:1;height:5px;border-radius:3px;background:${i <= index ? clip.accent : 'rgba(244,239,227,.18)'}"></span>`).join('')}
      </div>
      <div style="font-size:18px;opacity:.6">${APP} · recorded ${RECORDED}</div>
    </div>`,
    PANEL_W,
  )

const browser = await chromium.launch()
const tab = await browser.newPage({ viewport: { width: 1280, height: H } })
async function shoot(html, width, file) {
  await tab.setViewportSize({ width, height: H })
  await tab.setContent(html)
  await tab.evaluate(() => document.fonts.ready)
  await tab.screenshot({ path: file })
}

fs.mkdirSync(path.join(BUILD, 'cards'), { recursive: true })
await shoot(card('A live walkthrough of the system', [
  'Offline-first PWA for farmer registration, market prices, advice and mobile money',
  'Four roles: field agent, coordinator, administrator, farmer',
  `<span class="mono">${APP}</span>`,
]), 1280, path.join(BUILD, 'cards', 'intro.png'))
await shoot(card('Thank you', [
  `Try it: <span class="mono">${APP}</span>`,
  `Code, architecture and docs: <span class="mono">${REPO}</span>`,
  'Demo accounts and passwords are in the repository docs.',
]), 1280, path.join(BUILD, 'cards', 'outro.png'))

for (const clip of CLIPS) {
  const file = path.join(BUILD, 'captions', `${clip.id}.json`)
  if (!fs.existsSync(file)) continue
  const captions = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const [i, { text }] of captions.entries()) {
    await shoot(panel(clip, text, i, captions.length), PANEL_W, path.join(BUILD, 'cards', `${clip.id}-${i}.png`))
  }
}
await browser.close()
