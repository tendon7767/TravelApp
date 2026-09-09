import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 會把網站放在 /<repo>/ 底下，所以建置時要帶 base；
// 本機開發維持 '/'。用環境變數指定 repo 名稱，換 repo 不用改程式碼。
const base = process.env.GITHUB_PAGES_BASE ?? '/'

// 建置當下的時間與 commit，顯示在設定頁，讓「到底更新到哪一版」看得見。
// GITHUB_SHA 只有在 Actions 裡才有，本機建置就顯示 dev。
const buildTime = new Date().toISOString()
const buildSha = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7)

export default defineConfig({
  base,
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-512-maskable.png',
      ],
      manifest: {
        name: 'TravelApp 旅遊規劃',
        short_name: '旅遊規劃',
        description: '行程、花費、信用卡回饋與打包清單，離線可用',
        theme_color: '#161b22',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 全部靜態資源預先快取：飛機上、沒訊號的山區也要打得開。
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Apps Script 是資料同步用的，永遠走網路，不進快取。
        navigateFallbackDenylist: [/^\/macros\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.searchParams.get('travelapp') === 'thumb' &&
              /(^|\.)google(usercontent)?\.com$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'travelapp-photo-thumbnails-v1',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
        ],
      },
    }),
  ],
})
