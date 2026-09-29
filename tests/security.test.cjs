const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trustedPage, trustedSender } = require('../desktop/electron/security.cjs');

test('only packaged app and trusted main frame can use IPC', () => {
  const app = '/opt/prism/dist/index.html';
  assert.equal(trustedPage('file:///opt/prism/dist/index.html', app), true);
  for (const url of ['file:///etc/passwd', 'https://evil.test', 'file:///opt/prism/dist/index.html?evil=1']) {
    assert.equal(trustedPage(url, app), false);
  }
  const mainFrame = { url: 'file:///opt/prism/dist/index.html' };
  assert.equal(trustedSender({ senderFrame: mainFrame, sender: { mainFrame } }, app), true);
  assert.equal(trustedSender({ senderFrame: { ...mainFrame }, sender: { mainFrame } }, app), false);
});
test('development trust rejects remote and lookalike origins', () => {
  const dev = 'http://127.0.0.1:5173';
  assert.equal(trustedPage(dev + '/', '', dev), true);
  assert.equal(trustedPage('http://127.0.0.1:5174/', '', dev), false);
  assert.equal(trustedPage('https://evil.test/', '', 'https://evil.test'), false);
});
