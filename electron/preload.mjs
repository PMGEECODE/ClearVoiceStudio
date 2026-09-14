/**
 * Electron Preload Script — ClearVoice Studio
 *
 * Exposes a typed, secure API surface to the renderer via contextBridge.
 * Includes window management controls, platform detection, and auto-updater hooks.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  // Metadata & System Info
  getVersion: () => ipcRenderer.invoke("app:version"),
  getPiperStatus: () => ipcRenderer.invoke("piper:status"),
  getPlatform: () => ipcRenderer.invoke("system:platform"),

  // Window Controls (Frameless)
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  onMaximizedChange: (callback) => {
    const handler = (_event, isMax) => callback(isMax);
    ipcRenderer.on("window:maximized-change", handler);
    return () => ipcRenderer.removeListener("window:maximized-change", handler);
  },

  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  quitAndInstall: () => ipcRenderer.invoke("updater:quit-and-install"),

  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("updater:status", handler);
    return () => ipcRenderer.removeListener("updater:status", handler);
  },
});
