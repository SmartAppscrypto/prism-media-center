const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const windowDrags = new Map();

ipcMain.on('prism-window-drag-start', (event, point) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  windowDrags.set(event.sender.id, { window, pointer: point, bounds: window.getBounds() });
});

ipcMain.on('prism-window-drag-move', (event, point) => {
  const drag = windowDrags.get(event.sender.id);
  if (!drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  drag.window.setPosition(
    Math.round(drag.bounds.x + point.x - drag.pointer.x),
    Math.round(drag.bounds.y + point.y - drag.pointer.y),
    false
  );
});

ipcMain.on('prism-window-drag-end', (event) => windowDrags.delete(event.sender.id));

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#050506',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    window.loadURL(devServer);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
