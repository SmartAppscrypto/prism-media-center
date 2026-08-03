const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prismWindow', {
  startDrag: (x, y) => ipcRenderer.send('prism-window-drag-start', { x, y }),
  moveDrag: (x, y) => ipcRenderer.send('prism-window-drag-move', { x, y }),
  endDrag: () => ipcRenderer.send('prism-window-drag-end')
});

contextBridge.exposeInMainWorld('prismMetadata', {
  hasTmdbToken: () => ipcRenderer.invoke('prism-tmdb-status'),
  saveTmdbToken: (token) => ipcRenderer.invoke('prism-tmdb-save', token),
  clearTmdbToken: () => ipcRenderer.invoke('prism-tmdb-clear'),
  getTmdbMovie: (identifiers) => ipcRenderer.invoke('prism-tmdb-movie', identifiers),
  getProduction: (item) => ipcRenderer.invoke('prism-production-get', item),
  scanProduction: (items) => ipcRenderer.invoke('prism-production-scan', items),
  onProductionProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('prism-production-progress', listener);
    return () => ipcRenderer.removeListener('prism-production-progress', listener);
  }
});
