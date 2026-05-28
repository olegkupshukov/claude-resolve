// Resolve AI — Main Process
// Sandboxed Electron app loaded by DaVinci Resolve as a Workflow Integration Plugin.
// IPC handlers are split into ipc/ modules.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { setupResolveHandlers } = require('./ipc/resolve');
const { setupClaudeHandlers } = require('./ipc/claude');
const { setupAgentHandlers, cleanupAgent } = require('./ipc/agent');
const { setupOverlayHandlers } = require('./ipc/overlay');
const { setupConfigHandlers } = require('./ipc/config');
const { setupTemplateHandlers } = require('./ipc/templates');
const { setupAssetHandlers } = require('./ipc/assets');
const { setupTemplatePackHandlers } = require('./ipc/template-packs');
const { setupCaptionHandlers } = require('./ipc/captions');
const { setupShowcaseHandlers } = require('./ipc/showcase');
const { setupUpdateHandlers } = require('./ipc/updates');
const { setupPreviewHandlers } = require('./ipc/preview');
const { setupTimelineHandlers } = require('./ipc/timeline');
const { setupVariationHandlers } = require('./ipc/variations');
const { setupDebugHandlers } = require('./ipc/debug');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 700,
        alwaysOnTop: true,
        useContentSize: true,
        icon: path.join(__dirname, 'src', 'assets', 'favicon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.on('close', () => {
        cleanupAgent();
        app.quit();
    });
    mainWindow.loadFile('dist/index.html');
}

app.whenReady().then(async () => {
    createWindow();
    setupResolveHandlers(ipcMain);
    setupClaudeHandlers(ipcMain, mainWindow);
    setupAgentHandlers(ipcMain, mainWindow);
    setupOverlayHandlers(ipcMain, mainWindow);
    setupConfigHandlers(ipcMain);
    setupTemplateHandlers(ipcMain);
    setupAssetHandlers(ipcMain);
    setupTemplatePackHandlers(ipcMain);
setupCaptionHandlers(ipcMain);
setupShowcaseHandlers(ipcMain);
setupUpdateHandlers(ipcMain);
setupPreviewHandlers(ipcMain);
setupTimelineHandlers(ipcMain);
setupVariationHandlers(ipcMain);
setupDebugHandlers(ipcMain);
    ipcMain.handle('window:resize', (_event, { width, height }) => {
        mainWindow.setSize(width, height);
    });
    ipcMain.handle('shell:openExternal', (_event, url) => {
        shell.openExternal(url);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
