import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', includeAssets: ['favicon.svg', 'brand-mark.svg', 'field-pattern.svg', 'geo/lga-index.json', 'geo/ward-index.json'], manifest: { name: 'ResultTrail · Election evidence workflow', short_name: 'ResultTrail', start_url: '/', display: 'standalone', background_color: '#f5f7f2', theme_color: '#006747', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, workbox: { navigateFallback: '/index.html', globIgnores: ['**/ocr/**'], runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }, { urlPattern: /\/ocr\//, handler: 'CacheFirst', options: { cacheName: 'resulttrail-ocr-v1', expiration: { maxEntries: 9 } } }] } })],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
