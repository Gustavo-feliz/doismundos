/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
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
