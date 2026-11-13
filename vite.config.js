import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    // GitHub Pages serves project sites from /<repository-name>/.
    // Relative asset paths also keep the build usable from any subdirectory.
    base: './',
    plugins: [
      tailwindcss(),
      {
        name: 'preserve-root-manifest-link',
        enforce: 'post',
        generateBundle(_, bundle) {
          const htmlAsset = bundle['index.html'];
          if (htmlAsset && typeof htmlAsset.source === 'string') {
            htmlAsset.source = htmlAsset.source.replace(
              /href="\.\/assets\/manifest-[^"]+\.webmanifest"/i,
              'href="./manifest.webmanifest"',
            );
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        manifest: false,
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'manifest.webmanifest',
        ],
        workbox: {
          cacheId: 'sovpadenie-sixes-v1',
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sovpadenie-sixes-google-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sovpadenie-sixes-gstatic-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
