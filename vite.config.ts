import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Duranti-Travel-Agency/',
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
        icons: [],
      },
      workbox: {
        navigateFallback: '/Duranti-Travel-Agency/index.html',
      },
    }),
  ],
})
