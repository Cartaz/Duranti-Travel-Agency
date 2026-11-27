import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Duranti-Travel-Agency/',
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks change rarely, so app updates re-download less.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          dexie: ['dexie'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DTAgency',
        short_name: 'DTAgency',
        description: 'Private offline-first travel planner and journal.',
        theme_color: '#17130f',
        background_color: '#17130f',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'it',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/Duranti-Travel-Agency/index.html',
        globIgnores: ['**/runtime-config.json'],
      },
    }),
  ],
})
