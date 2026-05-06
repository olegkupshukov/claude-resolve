// Claude Resolve — Main Process
// Sandboxed Electron app loaded by DaVinci Resolve as a Workflow Integration Plugin.
// All Resolve API access happens here via WorkflowIntegration.node.
// Renderer communicates through preload.js (contextBridge / ipcMain.handle).

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const WorkflowIntegration = require('./WorkflowIntegration.node');

const PLUGIN_ID = 'com.clauderesolve.plugin';
const CLAUDE_PATH = path.join(process.env.APPDATA, 'npm', 'claude.cmd');

let mainWindow = null;
let resolveObj = null;
let projectManagerObj = null;
let claudeProcess = null;
let stdoutBuffer = '';

async function initResolveInterface() {
    const isSuccess = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!isSuccess) {
        console.error('Failed to initialize Resolve interface');
        return null;
    }

    const resolve = await WorkflowIntegration.GetResolve();
    if (!resolve) {
        console.error('Failed to get Resolve object');
        return null;
    }

    return resolve;
}

async function cleanupResolveInterface() {
    const isSuccess = WorkflowIntegration.CleanUp();
    if (!isSuccess) {
        console.error('Failed to cleanup Resolve interface');
    }
    resolveObj = null;
    projectManagerObj = null;
    return isSuccess;
}

async function getResolve() {
    if (!resolveObj) {
        resolveObj = await initResolveInterface();
    }
    return resolveObj;
}

async function getProjectManager() {
    if (!projectManagerObj) {
        const resolve = await getResolve();
        if (resolve) {
            projectManagerObj = await resolve.GetProjectManager();
        }
    }
    return projectManagerObj;
}

async function getCurrentProject() {
    const pm = await getProjectManager();
    if (!pm) return null;
    return await pm.GetCurrentProject();
}

// IPC handlers — Resolve operations exposed to renderer via preload bridge

async function handleOpenPage(_event, pageName) {
    const resolve = await getResolve();
    if (!resolve) return false;
    if (await resolve.GetCurrentPage() === pageName) return true;
    return await resolve.OpenPage(pageName);
}

async function handleGetCurrentPage() {
    const resolve = await getResolve();
    if (!resolve) return null;
    return await resolve.GetCurrentPage();
}

async function handleGetProjectName() {
    const project = await getCurrentProject();
    if (!project) return null;
    return await project.GetName();
}

async function handleGetCurrentTimeline() {
    const project = await getCurrentProject();
    if (!project) return null;
    const timeline = await project.GetCurrentTimeline();
    if (!timeline) return null;
    return await timeline.GetName();
}

function spawnClaude() {
    stdoutBuffer = '';

    claudeProcess = spawn(CLAUDE_PATH, [
        '--permission-mode', 'acceptEdits',
        '--no-session-persistence',
        '--output-format', 'stream-json'
    ], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    claudeProcess.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                handleStreamMessage(msg);
            } catch (_e) {
                mainWindow.webContents.send('claude:stdout', line);
            }
        }
    });

    claudeProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('claude:stderr', data.toString());
    });

    claudeProcess.on('close', () => {
        claudeProcess = null;
        stdoutBuffer = '';
    });

    claudeProcess.on('error', (err) => {
        mainWindow.webContents.send('claude:stderr', err.message);
        claudeProcess = null;
    });
}

function handleStreamMessage(msg) {
    if (msg.type === 'assistant') {
        const content = msg.message?.content || msg.content;
        if (typeof content === 'string') {
            mainWindow.webContents.send('claude:stdout', content);
        } else if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text) {
                    mainWindow.webContents.send('claude:stdout', block.text);
                }
            }
        }
    } else if (msg.type === 'result') {
        if (msg.result) {
            mainWindow.webContents.send('claude:stdout', msg.result);
        }
        mainWindow.webContents.send('claude:done', 0);
    }
}

async function handleClaudeSend(_event, text) {
    if (!claudeProcess) {
        spawnClaude();
    }
    claudeProcess.stdin.write(text + '\n');
}

function registerIpcHandlers() {
    ipcMain.handle('resolve:openPage', handleOpenPage);
    ipcMain.handle('resolve:getCurrentPage', handleGetCurrentPage);
    ipcMain.handle('resolve:getProjectName', handleGetProjectName);
    ipcMain.handle('resolve:getCurrentTimeline', handleGetCurrentTimeline);
    ipcMain.handle('resolve:cleanup', cleanupResolveInterface);
    ipcMain.handle('claude:send', handleClaudeSend);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 700,
        alwaysOnTop: true,
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.on('close', () => {
        if (claudeProcess) {
            claudeProcess.kill();
            claudeProcess = null;
        }
        app.quit();
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();
    spawnClaude();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
