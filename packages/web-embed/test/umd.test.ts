import { expect, test, vi } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

declare global {
  interface Window {
    RooksWebEmbed?: { version: string };
  }
}

// Needs `pnpm build` first.
async function loadBundle(): Promise<void> {
  const script = document.createElement('script');
  script.src = '/dist/index.umd.js';
  await new Promise((resolve, reject) => {
    script.addEventListener('load', resolve);
    script.addEventListener('error', () => reject(new Error('dist/index.umd.js did not load')));
    document.head.append(script);
  });
}

test('the UMD bundle loads after the ES module already defined <rooks-embed>', async () => {
  await import('../src/index.js');
  const defined = customElements.get('rooks-embed');
  const onError = vi.fn<(event: ErrorEvent) => void>();
  window.addEventListener('error', onError);
  try {
    await loadBundle();
  } finally {
    window.removeEventListener('error', onError);
  }

  expect(defined).toBeDefined();
  expect(onError).not.toHaveBeenCalled();
  expect(customElements.get('rooks-embed')).toBe(defined);
});

test('the UMD bundle exposes the package version on the RooksWebEmbed global', async () => {
  await loadBundle();

  expect(window.RooksWebEmbed?.version).toBe(pkg.version);
});
