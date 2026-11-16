// Copies each dist/*.d.ts to .d.cts so require() consumers get CommonJS types.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' })) {
  if (!file.endsWith('.d.ts')) {
    continue;
  }
  const source = readFileSync(join(dist, file), 'utf8');
  const cts = source.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.js(['"])/g, '$1.cjs$2');
  writeFileSync(join(dist, file.replace(/\.d\.ts$/, '.d.cts')), cts);
}
