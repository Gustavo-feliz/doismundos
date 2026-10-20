/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { DEV_PORT, PREVIEW_PORT } from './dev-ports';

export default defineConfig({
  server: { host: '127.0.0.1', port: DEV_PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
  build: {
    sourcemap: true,
    target: 'es2022',
    // three.js sozinho já passa de 500 kB minificado; avisar só acima disso.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
