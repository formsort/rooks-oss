import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packageDir = new URL('../../packages/web-embed/', import.meta.url);
const manifest = new URL('package.json', packageDir);
const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
const packageReadme = new URL('README.md', packageDir);
const repoReadme = new URL('../../README.md', import.meta.url);

function setVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Enter an exact release version, such as 0.1.0 or 0.1.0-alpha.1.');
  }
  pkg.version = version;
  writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
}

function bundleIntegrity() {
  const bundle = readFileSync(new URL(pkg.jsdelivr, packageDir));
  return `sha384-${createHash('sha384').update(bundle).digest('base64')}`;
}

function replaceLine(readme, pattern, replacement) {
  if (!pattern.test(readme)) {
    throw new Error(`Missing README release line matching ${pattern}`);
  }
  return readme.replace(pattern, replacement);
}

function updateReadmes(integrity, check) {
  const versionedPackage = `${pkg.name}@${pkg.version}`;
  const cdnUrl = `https://cdn.jsdelivr.net/npm/${versionedPackage}/${pkg.jsdelivr.slice(2)}`;
  const npmUrl = `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
  const packageText = readFileSync(packageReadme, 'utf8');
  const repoText = readFileSync(repoReadme, 'utf8');

  const pinnedInstall = replaceLine(
    packageText,
    /^pnpm add @rooks-ai\/web-embed@\S+$/m,
    `pnpm add ${versionedPackage}`,
  );
  const updatedPackage = replaceLine(
    pinnedInstall,
    /^<script\n  src="https:\/\/cdn\.jsdelivr\.net\/npm\/@rooks-ai\/web-embed@[^"]+"\n  integrity="[^"]+"\n  crossorigin="anonymous"\n><\/script>$/m,
    `<script\n  src="${cdnUrl}"\n  integrity="${integrity}"\n  crossorigin="anonymous"\n></script>`,
  );
  const updatedRepo = replaceLine(
    repoText,
    /^.+ <!-- web-embed-version -->$/m,
    `[Web embed ${pkg.version} on npm](${npmUrl}) <!-- web-embed-version -->`,
  );

  if (check) {
    if (updatedPackage !== packageText || updatedRepo !== repoText) {
      throw new Error('The release READMEs do not match the web embed bundle and version.');
    }
    return;
  }
  writeFileSync(packageReadme, updatedPackage);
  writeFileSync(repoReadme, updatedRepo);
}

switch (process.argv[2]) {
  case 'build':
    setVersion(process.argv[3]);
    execFileSync('pnpm', ['--filter', pkg.name, 'build'], { stdio: 'inherit' });
    appendFileSync(process.env.GITHUB_OUTPUT, `integrity=${bundleIntegrity()}\n`);
    break;
  case 'prepare': {
    const integrity = readFileSync(
      join(process.env.RUNNER_TEMP, 'web-embed-integrity'),
      'utf8',
    ).trim();
    if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) {
      throw new Error('Missing or invalid web embed bundle integrity.');
    }
    setVersion(process.env.CRAFT_NEW_VERSION);
    updateReadmes(integrity, false);
    break;
  }
  case 'check':
    updateReadmes(bundleIntegrity(), true);
    break;
  default:
    throw new Error('Expected build, prepare, or check.');
}
