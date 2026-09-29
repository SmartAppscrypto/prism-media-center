import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeGyp = resolve(desktopDirectory, '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
const nativeDirectory = resolve(desktopDirectory, 'electron', 'native');
const architecture = process.env.npm_config_arch || process.arch;
const result = spawnSync(process.execPath, [
  nodeGyp,
  'rebuild',
  `--target=${JSON.parse(readFileSync(resolve(desktopDirectory, 'package.json'), 'utf8')).devDependencies.electron}`,
  `--arch=${architecture}`,
  '--dist-url=https://electronjs.org/headers'
], { cwd: nativeDirectory, stdio: 'inherit' });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
