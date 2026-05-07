const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getResolve, getCurrentProject } = require('./resolve');

const TEMPLATE_DIR = path.join(
    process.env.APPDATA,
    'Blackmagic Design', 'DaVinci Resolve', 'Support',
    'Fusion', 'Templates', 'Edit', 'Titles', 'HTML Titles', 'ClaudeResolve'
);

function handleListTemplates() {
    if (!fs.existsSync(TEMPLATE_DIR)) return [];
    const entries = fs.readdirSync(TEMPLATE_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => {
        const manifestPath = path.join(TEMPLATE_DIR, e.name, e.name + '.ograf.json');
        let displayName = e.name;
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            if (manifest.name) displayName = manifest.name;
        } catch (_e) { /* use folder name */ }
        return { folder: e.name, name: displayName };
    });
}

function handleDeleteTemplate(_event, folder) {
    const dir = path.join(TEMPLATE_DIR, folder);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
}

function handleDeleteAllTemplates() {
    if (!fs.existsSync(TEMPLATE_DIR)) return false;
    fs.rmSync(TEMPLATE_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    return true;
}

async function handleOverlaySave(_event, { manifestJSON, componentJS, templateName }) {
    const dir = path.join(TEMPLATE_DIR, templateName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, templateName + '.ograf.json'), manifestJSON);
    fs.writeFileSync(path.join(dir, templateName + '.js'), componentJS);
    return dir;
}

let mainWindow = null;

async function importToTimeline(movPath) {
    const resolve = await getResolve();
    if (!resolve) throw new Error('Resolve not connected');

    const mediaStorage = await resolve.GetMediaStorage();
    const clips = await mediaStorage.AddItemListToMediaPool([movPath]);
    if (!clips || clips.length === 0) throw new Error('Failed to import to MediaPool');

    const project = await getCurrentProject();
    const mediaPool = await project.GetMediaPool();
    await mediaPool.AppendToTimeline(clips);
}

async function handleRenderMov(_event, { html, fps = 25, width = 1920, height = 1080 }) {
    const tempDir = path.join(os.tmpdir(), 'claude_resolve_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    const htmlPath = path.join(tempDir, 'overlay.html');
    const movPath = path.join(tempDir, 'overlay.mov');
    fs.writeFileSync(htmlPath, html);

    const renderScript = path.join(__dirname, '..', 'renderer', 'render.py');

    return new Promise((resolve) => {
        const proc = spawn('python', [
            renderScript, htmlPath,
            '--fps', String(fps),
            '--width', String(width),
            '--height', String(height),
            '--output', movPath
        ], { shell: true });

        let buf = '';

        proc.stdout.on('data', (chunk) => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    mainWindow.webContents.send('overlay:renderProgress', msg);
                } catch (_e) { /* ignore non-JSON */ }
            }
        });

        proc.on('close', async (code) => {
            if (code !== 0) {
                resolve({ success: false, error: 'Render process failed' });
                return;
            }
            try {
                await importToTimeline(movPath);
                resolve({ success: true, path: movPath });
            } catch (err) {
                resolve({ success: true, path: movPath, warning: 'Rendered but import failed: ' + err.message });
            }
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
}

function setupOverlayHandlers(ipcMain, win) {
    mainWindow = win;
    ipcMain.handle('overlay:save', handleOverlaySave);
    ipcMain.handle('overlay:renderMov', handleRenderMov);
    ipcMain.handle('templates:list', handleListTemplates);
    ipcMain.handle('templates:delete', handleDeleteTemplate);
    ipcMain.handle('templates:deleteAll', handleDeleteAllTemplates);
}

module.exports = { setupOverlayHandlers };
