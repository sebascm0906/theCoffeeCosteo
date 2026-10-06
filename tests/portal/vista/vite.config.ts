import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const mocks = fileURLToPath(new URL('./mocks.tsx', import.meta.url));
export default defineConfig({
  publicDir: fileURLToPath(new URL('../../../public', import.meta.url)),
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      { find: 'next/link', replacement: mocks },
      { find: 'next/navigation', replacement: mocks },
      { find: '@/app/(portal)/productos/actions', replacement: mocks },
      { find: '@/app/(portal)/configuracion/actions', replacement: mocks },
      { find: '@', replacement: raiz },
    ],
  },
});
