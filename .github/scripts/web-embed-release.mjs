import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const packageDir = new URL('../../packages/web-embed/', import.meta.url);
const manifest = new URL('package.json', packageDir);
const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
const bundlePath = posix.normalize(pkg.jsdelivr);
const packageReadme = new URL('README.md', packageDir);
const repoReadme = new URL('../../README.md', import.meta.url);

const installLine = /^pnpm add @rooks-ai\/web-embed@(\S+)$/m;
const scriptTag =
  /^<script\n  src="https:\/\/cdn\.jsdelivr\.net\/npm\/@rooks-ai\/web-embed@[^"]+"\n  integrity="[^"]+"\n  crossorigin="anonymous"\n><\/script>$/m;
const versionLine = /^.+ <!-- web-embed-version -->$/m;

function setVersion(version) {
  pkg.version = version;
  writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
}

function bundleIntegrity() {
  const bundle = readFileSync(new URL(bundlePath, packageDir));
  return `sha384-${createHash('sha384').update(bundle).digest('base64')}`;
}

function replaceLine(readme, pattern, replacement) {
  if (!pattern.test(readme)) {
    throw new Error(`Missing README release line matching ${pattern}`);
  }
  return readme.replace(pattern, replacement);
}

// A prerelease does not replace a stable version in the READMEs.
function pinsVersion(version) {
  const pinned = readFileSync(packageReadme, 'utf8').match(installLine)?.[1] ?? '';
  return !(version.includes('-') && /^\d+\.\d+\.\d+$/.test(pinned));
}

function renderReadmes(version, integrity) {
  const versionedPackage = `${pkg.name}@${version}`;
  const cdnUrl = `https://cdn.jsdelivr.net/npm/${versionedPackage}/${bundlePath}`;
  const npmUrl = `https://www.npmjs.com/package/${pkg.name}/v/${version}`;
  const packageText = readFileSync(packageReadme, 'utf8');
  const repoText = readFileSync(repoReadme, 'utf8');

  const pinnedInstall = replaceLine(packageText, installLine, `pnpm add ${versionedPackage}`);
  return [
    [
      packageReadme,
      packageText,
      replaceLine(
        pinnedInstall,
        scriptTag,
        `<script\n  src="${cdnUrl}"\n  integrity="${integrity}"\n  crossorigin="anonymous"\n></script>`,
      ),
    ],
    [
      repoReadme,
      repoText,
      replaceLine(
        repoText,
        versionLine,
        `[Web embed ${version} on npm](${npmUrl}) <!-- web-embed-version -->`,
      ),
    ],
  ];
}

switch (process.argv[2]) {
  // Runs in the read-only build-integrity job.
  case 'build': {
    const version = process.argv[3];
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error('Enter an exact release version, such as 0.1.0 or 0.1.0-alpha.1.');
    }
    setVersion(version);
    execFileSync('pnpm', ['--filter', pkg.name, 'build'], { stdio: 'inherit' });
    appendFileSync(process.env.GITHUB_OUTPUT, `integrity=${bundleIntegrity()}\n`);
    break;
  }
  // Craft runs this with the release app token in GITHUB_TOKEN. Only edit files here: never build
  // or start a process.
  case 'prepare': {
    const integrity = readFileSync(
      join(process.env.RUNNER_TEMP, 'web-embed-integrity'),
      'utf8',
    ).trim();
    if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) {
      throw new Error('Missing or invalid web embed bundle integrity.');
    }
    const version = process.env.CRAFT_NEW_VERSION;
    setVersion(version);
    if (pinsVersion(version)) {
      for (const [file, , updated] of renderReadmes(version, integrity)) {
        writeFileSync(file, updated);
      }
    }
    break;
  }
  case 'check':
    if (!pinsVersion(pkg.version)) {
      break;
    }
    for (const [, current, expected] of renderReadmes(pkg.version, bundleIntegrity())) {
      if (current !== expected) {
        throw new Error('The release READMEs do not match the web embed bundle and version.');
      }
    }
    break;
  case 'check-template':
    renderReadmes('0.0.0', `sha384-${'A'.repeat(64)}`);
    break;
  default:
    throw new Error('Expected build, prepare, check, or check-template.');
}
