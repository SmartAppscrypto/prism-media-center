// Only run against the disposable fresh server created by release CI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { signIn, getViews, getLibrary } from '../desktop/src/jellyfin.ts';
const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
const base = 'http://127.0.0.1:8096';
const password = randomUUID();
const info = await (await fetch(base + '/System/Info/Public')).json();
assert.equal(info.startupWizardCompleted ?? info.StartupWizardCompleted, false);
// Public info becomes available before database startup completes.
let ready = false;
for (let attempt = 0; attempt < 90; attempt += 1) {
  const response = await fetch(base + '/Startup/User');
  if (response.ok) { ready = true; break; }
  assert.equal(response.status, 503, `Unexpected startup response: ${response.status}`);
  await new Promise(resolve => setTimeout(resolve, 2000));
}
assert.ok(ready, 'Server did not finish initial database startup');
for (const [route, body] of [['User', { Name: 'prism-ci-viewer', Password: password }], ['Complete', null]]) {
  const response = await fetch(base + '/Startup/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `Setup ${route}: ${response.status}`);
}
const session = await signIn(base, 'prism-ci-viewer', password);
assert.ok(session.accessToken && session.userId);
assert.ok(Array.isArray(await getViews(session)));
assert.deepEqual(await getLibrary(session), []);
console.log('Fresh server setup, client sign-in, views and empty library passed.');
