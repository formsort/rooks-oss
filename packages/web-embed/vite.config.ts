import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Serve the browser tests and form fixture through different loopback hostnames.
  server: { host: '127.0.0.1' },
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
