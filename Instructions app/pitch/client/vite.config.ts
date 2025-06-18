import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    outDir: 'dist',
    assetsDir: 'assets',
  },
  base: '/pitch/', // ✅ Required so assets resolve correctly when served under /pitch/
});
