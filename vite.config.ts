import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Duranti Travel Agency',
        short_name: 'Duranti',
        description: 'Private offline-first travel planner and journal.',
        theme_color: '#17130f',
        background_color: '#17130f',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'it',
        icons: [],
      },
      workbox: {
        navigateFallback: '/index.html',
      },
    }),
  ],
})
