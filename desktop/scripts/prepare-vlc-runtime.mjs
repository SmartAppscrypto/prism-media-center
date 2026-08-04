import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = '/Applications/VLC.app/Contents/MacOS';
const destination = resolve(desktopDirectory, 'vendor', 'vlc');

try {
  await stat(resolve(source, 'lib', 'libvlc.5.dylib'));
  await stat(resolve(source, 'plugins'));
} catch {
  throw new Error('VLC.app must be installed in /Applications before packaging PRISM.');
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(resolve(source, 'lib'), resolve(destination, 'lib'), { recursive: true, verbatimSymlinks: true });
await cp(resolve(source, 'plugins'), resolve(destination, 'plugins'), { recursive: true, verbatimSymlinks: true });
await rm(resolve(destination, 'plugins', 'libmacosx_plugin.dylib'), { force: true });
await rm(resolve(destination, 'plugins', 'libosx_notifications_plugin.dylib'), { force: true });
