import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeGyp = resolve(desktopDirectory, '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
const nativeDirectory = resolve(desktopDirectory, 'electron', 'native');
const result = spawnSync(process.execPath, [
  nodeGyp,
  'rebuild',
  '--target=43.2.0',
  '--arch=arm64',
  '--dist-url=https://electronjs.org/headers'
], { cwd: nativeDirectory, stdio: 'inherit' });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
