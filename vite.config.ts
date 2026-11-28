import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Defense in depth for a page that holds decrypted identity documents in memory.
// Only same-origin code may run; blob:/data: are needed for local photos, videos
// and attachments; https: covers the runtime-configurable Nominatim endpoint.
// Injected only into production builds: the dev server relies on inline
// React Refresh scripts. frame-ancestors cannot be set from a <meta> tag.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'dtagency-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

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
    contentSecurityPolicy(),
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
        // PNG first: iOS ignores SVG manifest icons. The PNGs are full-bleed so
        // they are also safe as maskable icons.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallback: '/Duranti-Travel-Agency/index.html',
        globIgnores: ['**/runtime-config.json'],
      },
    }),
  ],
})
