const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prismWindow', {
  startDrag: (x, y) => ipcRenderer.send('prism-window-drag-start', { x, y }),
  moveDrag: (x, y) => ipcRenderer.send('prism-window-drag-move', { x, y }),
  endDrag: () => ipcRenderer.send('prism-window-drag-end')
});
