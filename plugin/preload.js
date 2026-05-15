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
    renderMov: (data) => ipcRenderer.invoke('overlay:renderMov', data),
    onRenderProgress: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on('overlay:renderProgress', handler);
        return () => ipcRenderer.removeListener('overlay:renderProgress', handler);
    },
    listRenders: () => ipcRenderer.invoke('renders:list'),
    deleteRender: (name) => ipcRenderer.invoke('renders:delete', name),
    deleteAllRenders: () => ipcRenderer.invoke('renders:deleteAll'),
    syncToMediaPool: () => ipcRenderer.invoke('renders:syncToMediaPool')
});

contextBridge.exposeInMainWorld('claudeAPI', {
    checkAuth: () => ipcRenderer.invoke('claude:checkAuth'),
    openLoginTerminal: () => ipcRenderer.invoke('claude:openLoginTerminal'),
    start: () => ipcRenderer.invoke('claude:start'),
    restart: () => ipcRenderer.invoke('claude:restart'),
    sendPrompt: (text) => ipcRenderer.invoke('claude:send', text),
    abort: () => ipcRenderer.invoke('claude:abort'),
    onOutput: (callback) => ipcRenderer.on('claude:stdout', (_e, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('claude:stderr', (_e, data) => callback(data)),
    onDone: (callback) => ipcRenderer.on('claude:done', (_e, code) => callback(code)),
    onStatus: (callback) => ipcRenderer.on('claude:status', (_e, data) => callback(data))
});

contextBridge.exposeInMainWorld('windowAPI', {
    resize: ({ width, height }) => ipcRenderer.invoke('window:resize', { width, height }),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});

contextBridge.exposeInMainWorld('configAPI', {
    get: () => ipcRenderer.invoke('config:get'),
    set: (partial) => ipcRenderer.invoke('config:set', partial)
});

contextBridge.exposeInMainWorld('updatesAPI', {
    check: () => ipcRenderer.invoke('app:checkUpdate')
});
