import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(desktopDirectory, 'vendor', 'vlc');

async function exists(pathname) {
  try { await stat(pathname); return true; }
  catch { return false; }
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

if (process.platform === 'win32') {
  const candidates = [
    process.env.PRISM_VLC_DIR,
    process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'VideoLAN', 'VLC'),
    process.env['ProgramFiles(x86)'] && resolve(process.env['ProgramFiles(x86)'], 'VideoLAN', 'VLC')
  ].filter(Boolean);
  const source = candidates.find((candidate) => (
    candidate
    && awaitableExists(resolve(candidate, 'libvlc.dll'))
    && awaitableExists(resolve(candidate, 'libvlccore.dll'))
    && awaitableExists(resolve(candidate, 'plugins'))
  ));
  if (!source) throw new Error('Install 64-bit VLC, or set PRISM_VLC_DIR to an extracted VLC directory, before packaging PRISM.');

  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
      await cp(resolve(source, entry.name), resolve(destination, entry.name));
    }
  }
  await cp(resolve(source, 'plugins'), resolve(destination, 'plugins'), { recursive: true });
} else {
  const source = '/Applications/VLC.app/Contents/MacOS';
  if (!await exists(resolve(source, 'lib', 'libvlc.5.dylib')) || !await exists(resolve(source, 'plugins'))) {
    throw new Error('VLC.app must be installed in /Applications before packaging PRISM.');
  }
  await cp(resolve(source, 'lib'), resolve(destination, 'lib'), { recursive: true, verbatimSymlinks: true });
  await cp(resolve(source, 'plugins'), resolve(destination, 'plugins'), { recursive: true, verbatimSymlinks: true });
  await rm(resolve(destination, 'plugins', 'libmacosx_plugin.dylib'), { force: true });
  await rm(resolve(destination, 'plugins', 'libosx_notifications_plugin.dylib'), { force: true });
}

function awaitableExists(pathname) {
  try {
    const metadata = statSync(pathname);
    return metadata.isFile() || metadata.isDirectory();
  }
  catch { return false; }
}
