import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default. A component test opts into jsdom with a docblock at the top of the file:
    //   /** @vitest-environment jsdom */
    // `environmentMatchGlobs` was removed in Vitest 5 — this is its replacement, and it has the
    // advantage that the file states its own environment instead of a glob doing it at a distance.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx,mts}', 'scripts/**/*.test.{ts,mts}'],
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
