import { expect, test } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

declare global {
  interface Window {
    RooksWebEmbed?: { version: string };
  }
}

// Needs `pnpm build` first.
test('the UMD bundle exposes the package version on the RooksWebEmbed global', async () => {
  const script = document.createElement('script');
  script.src = '/dist/index.umd.js';
  await new Promise((resolve, reject) => {
    script.addEventListener('load', resolve);
    script.addEventListener('error', () => reject(new Error('dist/index.umd.js did not load')));
    document.head.append(script);
  });

  expect(window.RooksWebEmbed?.version).toBe(pkg.version);
});
