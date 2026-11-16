import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'RooksWebEmbed',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) =>
        format === 'es' ? 'index.js' : format === 'cjs' ? 'index.cjs' : 'index.umd.js',
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
