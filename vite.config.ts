import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 會把網站放在 /<repo>/ 底下，所以建置時要帶 base；
// 本機開發維持 '/'。用環境變數指定 repo 名稱，換 repo 不用改程式碼。
const base = process.env.GITHUB_PAGES_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'TravelApp 旅遊規劃',
        short_name: '旅遊規劃',
        description: '行程、花費、信用卡回饋與打包清單，離線可用',
        theme_color: '#1c1c1b',
        background_color: '#f7f6f3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 全部靜態資源預先快取：飛機上、沒訊號的山區也要打得開。
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Apps Script 是資料同步用的，永遠走網路，不進快取。
        navigateFallbackDenylist: [/^\/macros\//],
      },
    }),
  ],
})
