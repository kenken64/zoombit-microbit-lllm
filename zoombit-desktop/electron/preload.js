// Preload exposes a safe IPC to the renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  syncHex: () => ipcRenderer.invoke('sync-hex'),
  listSerial: () => ipcRenderer.invoke('serial-list'),
  openSerial: (path, baudRate) => ipcRenderer.invoke('serial-open', { path, baudRate }),
  closeSerial: () => ipcRenderer.invoke('serial-close'),
  onSerialData: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('serial-data', listener);
    return () => ipcRenderer.off('serial-data', listener);
  },
  // chooseDocFolder still exposed but not required when default is present
  chooseDocFolder: () => ipcRenderer.invoke('choose-doc-folder'),
  listDocImages: () => ipcRenderer.invoke('list-doc-images')
});

