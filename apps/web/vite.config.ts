import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5377, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 300 },
});
