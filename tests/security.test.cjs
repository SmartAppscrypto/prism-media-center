const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { trustedPage, trustedSender } = require('../desktop/electron/security.cjs');

test('only packaged app and trusted main frame can use IPC', () => {
  const app = path.resolve('desktop/dist/index.html');
  const appURL = pathToFileURL(app).href;
  assert.equal(trustedPage(appURL, app), true);
  for (const url of ['file:///etc/passwd', 'https://evil.test', appURL + '?evil=1']) {
    assert.equal(trustedPage(url, app), false);
  }
  const mainFrame = { url: appURL };
  assert.equal(trustedSender({ senderFrame: mainFrame, sender: { mainFrame } }, app), true);
  assert.equal(trustedSender({ senderFrame: { ...mainFrame }, sender: { mainFrame } }, app), false);
});
test('development trust rejects remote and lookalike origins', () => {
  const dev = 'http://127.0.0.1:5173';
  assert.equal(trustedPage(dev + '/', '', dev), true);
  assert.equal(trustedPage('http://127.0.0.1:5174/', '', dev), false);
  assert.equal(trustedPage('https://evil.test/', '', 'https://evil.test'), false);
});
