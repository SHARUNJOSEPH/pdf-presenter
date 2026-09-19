const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // File Path Resolution for DOM File objects
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {}
    return file ? (file.path || '') : '';
  },

  // Screen Management & Real-time HDMI Hotplug
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  refreshDisplays: () => ipcRenderer.invoke('get-displays'),
  onDisplaysChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('displays-changed', listener);
    return () => ipcRenderer.removeListener('displays-changed', listener);
  },

  // Native OS File Dialog
  selectPdfFile: (options) => ipcRenderer.invoke('select-pdf-file', options),
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

  // Stage Confidence Monitor
  launchConfidenceWindow: (options) => ipcRenderer.invoke('launch-confidence-window', options),
  openConfidenceWindow: (options) => ipcRenderer.invoke('launch-confidence-window', options),

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
  setEdition: (edition) => ipcRenderer.invoke('set-edition', edition),
  toggleEdition: () => ipcRenderer.invoke('toggle-edition'),
  forgetLicense: () => ipcRenderer.invoke('forget-license'),
  onLicenseChanged: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('license-changed', listener);
    return () => ipcRenderer.removeListener('license-changed', listener);
  }
});
