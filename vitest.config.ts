import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    projects: [
      { extends: true, test: { name: 'node', include: ['tests/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'dom', include: ['tests/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['tests/portal/setup.ts'] } },
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
