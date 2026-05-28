// Resolve AI — Preload Bridge
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
    getTimelineSettings: () => ipcRenderer.invoke('resolve:getTimelineSettings'),

    // Lifecycle
    cleanup: () => ipcRenderer.invoke('resolve:cleanup')
});

contextBridge.exposeInMainWorld('timelineAPI', {
    getContext: () => ipcRenderer.invoke('timeline:getContext'),
    generateAtPlayhead: (payload) => ipcRenderer.invoke('timeline:generateAtPlayhead', payload)
});

contextBridge.exposeInMainWorld('overlayAPI', {
    renderMov: (data) => ipcRenderer.invoke('overlay:renderMov', data),
    validate: (data) => ipcRenderer.invoke('overlay:validate', data),
    onRenderProgress: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on('overlay:renderProgress', handler);
        return () => ipcRenderer.removeListener('overlay:renderProgress', handler);
    },
    listRenders: () => ipcRenderer.invoke('renders:list'),
    deleteRender: (name) => ipcRenderer.invoke('renders:delete', name),
    renameRender: (name, nextName) => ipcRenderer.invoke('renders:rename', name, nextName),
    revealRender: (name) => ipcRenderer.invoke('renders:reveal', name),
    deleteAllRenders: () => ipcRenderer.invoke('renders:deleteAll'),
    syncToMediaPool: () => ipcRenderer.invoke('renders:syncToMediaPool'),
    queue: (payload) => ipcRenderer.invoke('renders:queue', payload)
});

function createAgentBridge(prefix) {
    return {
        checkAuth: () => ipcRenderer.invoke(`${prefix}:checkAuth`),
        openLoginTerminal: () => ipcRenderer.invoke(`${prefix}:openLoginTerminal`),
        openProviderLoginTerminal: (providerId) => ipcRenderer.invoke(`${prefix}:openProviderLoginTerminal`, providerId),
        start: () => ipcRenderer.invoke(`${prefix}:start`),
        health: () => ipcRenderer.invoke(`${prefix}:health`),
        getLogs: (options) => ipcRenderer.invoke(`${prefix}:getLogs`, options),
        clearLogs: () => ipcRenderer.invoke(`${prefix}:clearLogs`),
        restart: () => ipcRenderer.invoke(`${prefix}:restart`),
        sendPrompt: (text) => ipcRenderer.invoke(`${prefix}:send`, text),
        repairRender: (payload) => ipcRenderer.invoke(`${prefix}:repairRender`, payload),
        abort: () => ipcRenderer.invoke(`${prefix}:abort`),
        onOutput: (callback) => ipcRenderer.on(`${prefix}:stdout`, (_e, data) => callback(data)),
        onError: (callback) => ipcRenderer.on(`${prefix}:stderr`, (_e, data) => callback(data)),
        onDone: (callback) => ipcRenderer.on(`${prefix}:done`, (_e, code) => callback(code)),
        onStatus: (callback) => ipcRenderer.on(`${prefix}:status`, (_e, data) => callback(data))
    };
}

contextBridge.exposeInMainWorld('agentAPI', createAgentBridge('agent'));
contextBridge.exposeInMainWorld('claudeAPI', createAgentBridge('claude'));

contextBridge.exposeInMainWorld('windowAPI', {
    resize: ({ width, height }) => ipcRenderer.invoke('window:resize', { width, height }),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});

contextBridge.exposeInMainWorld('configAPI', {
    get: () => ipcRenderer.invoke('config:get'),
    set: (partial) => ipcRenderer.invoke('config:set', partial)
});

contextBridge.exposeInMainWorld('brandAPI', {
    get: () => ipcRenderer.invoke('brand:get'),
    set: (brandKit) => ipcRenderer.invoke('brand:set', brandKit)
});

contextBridge.exposeInMainWorld('templateAPI', {
    list: () => ipcRenderer.invoke('templates:list'),
    save: (template) => ipcRenderer.invoke('templates:save', template),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
    use: (id) => ipcRenderer.invoke('templates:use', id)
});

contextBridge.exposeInMainWorld('assetAPI', {
    list: () => ipcRenderer.invoke('assets:list'),
    add: (payload) => ipcRenderer.invoke('assets:add', payload),
    update: (id, patch) => ipcRenderer.invoke('assets:update', id, patch),
    delete: (id) => ipcRenderer.invoke('assets:delete', id),
    reveal: (id) => ipcRenderer.invoke('assets:reveal', id),
    inspect: (id) => ipcRenderer.invoke('assets:inspect', id),
    extractColors: (id) => ipcRenderer.invoke('assets:extractColors', id),
    resolveHtml: (html, selectedAssetIds, options) => ipcRenderer.invoke('assets:resolveHtml', html, selectedAssetIds, options)
});

contextBridge.exposeInMainWorld('galleryAPI', {
    list: () => ipcRenderer.invoke('gallery:list'),
    use: (id) => ipcRenderer.invoke('gallery:use', id),
    importPack: () => ipcRenderer.invoke('templatePacks:import'),
    installPackFromUrl: (url) => ipcRenderer.invoke('templatePacks:installFromUrl', { url }),
    validatePack: (pack) => ipcRenderer.invoke('templatePacks:validate', pack)
});

contextBridge.exposeInMainWorld('captionAPI', {
    import: () => ipcRenderer.invoke('captions:import'),
    parse: (payload) => ipcRenderer.invoke('captions:parse', payload),
    generate: (payload) => ipcRenderer.invoke('captions:generate', payload)
});

contextBridge.exposeInMainWorld('variationAPI', {
    generate: (payload) => ipcRenderer.invoke('variations:generate', payload),
    generateMultiPrompt: (payload) => ipcRenderer.invoke('variations:generateMultiPrompt', payload)
});

contextBridge.exposeInMainWorld('debugAPI', {
    createBundle: (options) => ipcRenderer.invoke('debug:createBundle', options)
});

contextBridge.exposeInMainWorld('showcaseAPI', {
    build: (options) => ipcRenderer.invoke('showcase:build', options)
});

contextBridge.exposeInMainWorld('updatesAPI', {
    check: (opts) => ipcRenderer.invoke('app:checkUpdate', opts)
});

contextBridge.exposeInMainWorld('previewAPI', {
    getRealtimeBundle: () => ipcRenderer.invoke('preview:getRealtimeBundle')
});
