const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const writes = new Map();

function writeJsonAtomic(filename, value) {
  // Snapshot before queueing so later cache changes cannot alter this write.
  const contents = JSON.stringify(value);
  const write = (writes.get(filename) || Promise.resolve()).catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      const file = await fs.open(temporary, 'wx', 0o600);
      try { await file.writeFile(contents); await file.sync(); }
      finally { await file.close(); }
      await fs.rename(temporary, filename);
    } finally { await fs.rm(temporary, { force: true }); }
  });
  writes.set(filename, write);
  return write.finally(() => { if (writes.get(filename) === write) writes.delete(filename); });
}
module.exports = { writeJsonAtomic };
