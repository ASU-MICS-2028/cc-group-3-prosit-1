import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      // The service worker downloads every app file the first time the phone is online,
      // then serves them from the phone afterwards. That is what lets the app open offline.
      // Our own service worker (src/sw.ts) so it can also send the queue after the app is closed.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      injectManifest: {
        // mp3: recorded audio for low-literacy users (public/audio), so it plays offline too.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
      },
      manifest: {
        name: 'AgroConnect Ghana',
        short_name: 'AgroConnect',
        description: 'Farmer registration, market prices, weather, advice and mobile money for Ghanaian farmers, even with no signal.',
        id: '/',
        lang: 'en-GH',
        dir: 'ltr',
        orientation: 'portrait',
        categories: ['agriculture', 'education', 'finance'],
        theme_color: '#1F3D2B',
        background_color: '#F4F1E6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
