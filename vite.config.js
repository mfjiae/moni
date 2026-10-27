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
      includeAssets: ['icon.svg'],
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
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
