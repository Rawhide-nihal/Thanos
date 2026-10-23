import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: '/studio.html',
    headers: {
      // Required for SharedArrayBuffer / high performance WASM if used
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        studio: resolve(__dirname, 'studio.html'),
        popup: resolve(__dirname, 'popup.html'),
        output: resolve(__dirname, 'output.html'),
        index: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/extension/background/index.ts'),
        content: resolve(__dirname, 'src/extension/content/index.ts'),
        interceptor: resolve(__dirname, 'src/extension/main-world/interceptor.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (['background', 'content', 'interceptor'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
  },
});
