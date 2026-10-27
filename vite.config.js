import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Hosted at https://mfjiae.github.io/moni/
export default defineConfig({
  base: '/moni/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // The screenshot reader (public/ocr, ~7 MB) downloads only when you first read a screenshot.
      workbox: { globIgnores: ['**/ocr/**'] },
      manifest: {
        name: 'moni',
        short_name: 'moni',
        description: 'Personal spending tracker and budgets',
        theme_color: '#111010',
        background_color: '#111010',
        display: 'standalone',
        start_url: '/moni/',
        scope: '/moni/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
