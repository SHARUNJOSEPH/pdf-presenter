// preload.js - Secure Electron Context Bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Screen Management
  getDisplays: () => ipcRenderer.invoke('get-displays'),

  // Native OS File Dialog
  selectPdfFile: () => ipcRenderer.invoke('select-pdf-file'),
  loadRecentPdf: (filePath) => ipcRenderer.invoke('load-recent-pdf', filePath),
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

  // Bitfocus Companion & Remote Control API
  getCompanionInfo: () => ipcRenderer.invoke('get-companion-info'),
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  updateApiConfig: (config) => ipcRenderer.invoke('update-api-config', config),

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
  },

  // Updates & Companion Preset Export
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  exportCompanionConfig: (options) => ipcRenderer.invoke('export-companion-config', options),

  // Freemium & In-App Purchase (IAP) License Management
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  purchasePro: () => ipcRenderer.invoke('purchase-pro'),
  activateLicenseKey: (key) => ipcRenderer.invoke('activate-license-key', key),
  startCompanionTrial: () => ipcRenderer.invoke('start-companion-trial'),
  onLicenseChanged: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('license-changed', listener);
    return () => ipcRenderer.removeListener('license-changed', listener);
  }
});
