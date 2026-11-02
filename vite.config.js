import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages serves project sites from /<repository-name>/.
    // Relative asset paths also keep the build usable from any subdirectory.
    base: './',
    plugins: [tailwindcss()],
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
