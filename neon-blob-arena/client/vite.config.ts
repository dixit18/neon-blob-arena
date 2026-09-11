import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // portable: works on GitHub Pages project sites with no config change
  server: { port: 5377, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 300 },
});
