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
  findProductionMatches: (query) => ipcRenderer.invoke('prism-production-find', query),
  scanProduction: (items) => ipcRenderer.invoke('prism-production-scan', items),
  onProductionProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('prism-production-progress', listener);
    return () => ipcRenderer.removeListener('prism-production-progress', listener);
  }
});

contextBridge.exposeInMainWorld('prismNativePlayer', {
  status: () => ipcRenderer.invoke('prism-native-status'),
  start: (mediaUrl, subtitleStyle) => ipcRenderer.invoke('prism-native-start', mediaUrl, subtitleStyle),
  state: () => ipcRenderer.invoke('prism-native-state'),
  setPaused: (paused) => ipcRenderer.invoke('prism-native-pause', paused),
  seek: (milliseconds) => ipcRenderer.invoke('prism-native-seek', milliseconds),
  setVolume: (volume) => ipcRenderer.invoke('prism-native-volume', volume),
  addSubtitle: (subtitleUrl) => ipcRenderer.invoke('prism-native-subtitle-add', subtitleUrl),
  selectSubtitle: (track) => ipcRenderer.invoke('prism-native-subtitle-select', track),
  disableSubtitles: () => ipcRenderer.invoke('prism-native-subtitle-off'),
  stop: () => ipcRenderer.invoke('prism-native-stop')
});
