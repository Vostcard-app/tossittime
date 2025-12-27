import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false, // Disable service worker in dev mode to prevent caching issues
      },
      includeAssets: ['icons/*.png', 'vite.svg', 'logo.png'],
      manifest: {
        name: 'TossItTime - Food Expiration Tracker',
        short_name: 'TossItTime',
        description: 'Track your food expiration dates and get reminders before it\'s toss it time',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#002B4D',
        orientation: 'portrait',
        scope: '/',
        icons: [
          {
            src: '/vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          // Add these icons when ready (see PWA_ICONS_SETUP.md):
          // {
          //   src: '/icons/icon-192.png',
          //   sizes: '192x192',
          //   type: 'image/png',
          //   purpose: 'any'
          // },
          // {
          //   src: '/icons/icon-512.png',
          //   sizes: '512x512',
          //   type: 'image/png',
          //   purpose: 'any'
          // },
          // {
          //   src: '/icons/icon-192-maskable.png',
          //   sizes: '192x192',
          //   type: 'image/png',
          //   purpose: 'maskable'
          // },
          // {
          //   src: '/icons/icon-512-maskable.png',
          //   sizes: '512x512',
          //   type: 'image/png',
          //   purpose: 'maskable'
          // }
        ],
        categories: ['food', 'lifestyle', 'productivity'],
        lang: 'en',
        dir: 'ltr'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\/.*/,
          /^\/assets\/.*/,
          /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/
        ],
        runtimeCaching: [
          {
            urlPattern: /\.html$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5174,
    host: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
