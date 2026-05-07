// Claude Resolve — Preload Bridge
// Exposes a safe resolveAPI surface to the renderer via contextBridge.
// Each method maps 1:1 to an ipcMain.handle channel in main.js.

const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('resolveAPI', {
    // Navigation
    openPage: (pageName) => ipcRenderer.invoke('resolve:openPage', pageName),
    getCurrentPage: () => ipcRenderer.invoke('resolve:getCurrentPage'),

    // Project
    getProjectName: () => ipcRenderer.invoke('resolve:getProjectName'),

    // Timeline
    getCurrentTimeline: () => ipcRenderer.invoke('resolve:getCurrentTimeline'),

    // Lifecycle
    cleanup: () => ipcRenderer.invoke('resolve:cleanup')
});

contextBridge.exposeInMainWorld('overlayAPI', {
    save: (data) => ipcRenderer.invoke('overlay:save', data),
    insertTitle: (titleName) => ipcRenderer.invoke('resolve:insertTitle', titleName)
});

contextBridge.exposeInMainWorld('claudeAPI', {
    sendPrompt: (text) => ipcRenderer.invoke('claude:send', text),
    abort: () => ipcRenderer.invoke('claude:abort'),
    onOutput: (callback) => ipcRenderer.on('claude:stdout', (_e, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('claude:stderr', (_e, data) => callback(data)),
    onDone: (callback) => ipcRenderer.on('claude:done', (_e, code) => callback(code))
});
