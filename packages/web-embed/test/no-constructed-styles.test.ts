import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Safari before 16.4 throws on `new CSSStyleSheet()`.
test('the SDK loads and <rooks-embed> is a block without constructable stylesheets', async () => {
  vi.stubGlobal('CSSStyleSheet', function CSSStyleSheet() {
    throw new TypeError('Illegal constructor');
  });
  const { embed } = await import('../src/index.js');
  const element = document.createElement('rooks-embed');
  document.body.append(element);

  try {
    expect(embed).toBeTypeOf('function');
    expect(getComputedStyle(element).display).toBe('block');
  } finally {
    element.remove();
  }
});
