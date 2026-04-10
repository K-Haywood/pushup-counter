import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildStamp = new Date().toISOString();

export default defineConfig({
  base: './',
  define: {
    __APP_BUILD__: JSON.stringify(buildStamp)
  },
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        sourcemap: false,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
