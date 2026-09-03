// preload.js - Secure Electron Context Bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Screen Management
  getDisplays: () => ipcRenderer.invoke('get-displays'),

  // Native OS File Dialog
  selectPdfFile: () => ipcRenderer.invoke('select-pdf-file'),
  setActivePdfBuffer: (data) => ipcRenderer.invoke('set-active-pdf-buffer', data),

  // Presentation Lifecycle
  startPresentation: (config) => ipcRenderer.invoke('start-presentation', config),
  endPresentation: () => ipcRenderer.invoke('end-presentation'),
  getPresentationData: () => ipcRenderer.invoke('get-presentation-data'),
  onPresentationEnded: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('presentation-ended', listener);
    return () => ipcRenderer.removeListener('presentation-ended', listener);
  },

  // Bitfocus Companion Info
  getCompanionInfo: () => ipcRenderer.invoke('get-companion-info'),

  // External Link Opener (Browser)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Fullscreen Management
  togglePresenterFullscreen: () => ipcRenderer.invoke('toggle-presenter-fullscreen'),

  // Cross-Window IPC Synchronization
  sendSync: (payload) => ipcRenderer.send('sync-event', payload),
  onSync: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('sync-event', listener);
    return () => ipcRenderer.removeListener('sync-event', listener);
  }
});
