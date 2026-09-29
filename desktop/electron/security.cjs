const { pathToFileURL } = require('node:url');

function trustedPage(url, appFile, devServer) {
  try {
    const candidate = new URL(url);
    if (devServer) {
      const development = new URL(devServer);
      return ['localhost', '127.0.0.1', '[::1]'].includes(development.hostname)
        && candidate.origin === development.origin && candidate.pathname === '/';
    }
    const expected = pathToFileURL(appFile);
    return candidate.protocol === 'file:' && candidate.hostname === expected.hostname
      && candidate.pathname === expected.pathname && !candidate.search;
  } catch { return false; }
}

function trustedSender(event, appFile, devServer) {
  return Boolean(event.senderFrame && event.senderFrame === event.sender.mainFrame
    && trustedPage(event.senderFrame.url, appFile, devServer));
}
module.exports = { trustedPage, trustedSender };
