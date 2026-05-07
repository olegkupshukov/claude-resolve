// Claude Resolve — Main Process
// Sandboxed Electron app loaded by DaVinci Resolve as a Workflow Integration Plugin.
// IPC handlers are split into ipc/ modules.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { setupResolveHandlers } = require('./ipc/resolve');
const { setupClaudeHandlers, cleanupClaude } = require('./ipc/claude');
const { setupOverlayHandlers } = require('./ipc/overlay');
const { setupConfigHandlers } = require('./ipc/config');

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
        cleanupClaude();
        app.quit();
    });
    mainWindow.loadFile('dist/index.html');
}

app.whenReady().then(async () => {
    createWindow();
    setupResolveHandlers(ipcMain);
    setupClaudeHandlers(ipcMain, mainWindow);
    setupOverlayHandlers(ipcMain, mainWindow);
    setupConfigHandlers(ipcMain);
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
