const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { getResolve, getCurrentProject } = require('./resolve');
const { readConfig } = require('./config');
const {
    RENDER_DIR,
    PYTHON_CANDIDATES, PYTHON_VERIFY_CMD,
    FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD
} = require('./paths');

// Resolve executable paths at load time — Resolve's Electron may have a stripped PATH
function findExecutable(candidates, verifyCmd) {
    // Try shell lookup first (inherits system PATH)
    try {
        const found = execSync(verifyCmd, { encoding: 'utf-8', shell: true }).trim();
        if (found && fs.existsSync(found)) return found;
    } catch (_e) { /* continue to candidates */ }
    // Try known install locations
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[0]; // last resort
}

const PYTHON_PATH = findExecutable(PYTHON_CANDIDATES, PYTHON_VERIFY_CMD);
const FFMPEG_PATH = findExecutable(FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD);

console.log('RESOLVED: python=' + PYTHON_PATH, 'ffmpeg=' + FFMPEG_PATH);

function renderFilename(name) {
    const safe = (name || 'Overlay').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    return `${safe}_${ts}.mov`;
}

let mainWindow = null;

async function findOrCreateBin(mediaPool, binName) {
    const root = await mediaPool.GetRootFolder();
    const subs = await root.GetSubFolderList();
    for (const folder of subs) {
        const name = await folder.GetName();
        if (name === binName) return folder;
    }
    return await mediaPool.AddSubFolder(root, binName);
}

function timecodeToFrame(tc, fps) {
    // tc format: "HH:MM:SS:FF" or "HH:MM:SS;FF" (drop-frame)
    const parts = tc.replace(';', ':').split(':').map(Number);
    if (parts.length !== 4) return 0;
    return ((parts[0] * 3600 + parts[1] * 60 + parts[2]) * fps) + parts[3];
}

async function findEmptyTrack(timeline, atFrame, clipFrames) {
    const trackCount = await timeline.GetTrackCount('video');
    // Search from V2 upward for an empty slot at playhead
    for (let t = 2; t <= trackCount; t++) {
        const items = await timeline.GetItemListInTrack('video', t);
        if (!items || items.length === 0) return t;
        let occupied = false;
        for (const item of items) {
            const start = await item.GetStart();
            const end = await item.GetEnd();
            // Overlap check: clip would occupy [atFrame, atFrame+clipFrames)
            if (atFrame < end && (atFrame + clipFrames) > start) {
                occupied = true;
                break;
            }
        }
        if (!occupied) return t;
    }
    // All tracks occupied — add a new one
    await timeline.AddTrack('video');
    return trackCount + 1;
}

async function importToTimeline(movPath) {
    const resolve = await getResolve();
    if (!resolve) throw new Error('Resolve not connected');

    const project = await getCurrentProject();
    const mediaPool = await project.GetMediaPool();

    // Import into "Claude Resolve" bin
    const prevFolder = await mediaPool.GetCurrentFolder();
    const bin = await findOrCreateBin(mediaPool, 'Claude Resolve');
    await mediaPool.SetCurrentFolder(bin);
    const clips = await mediaPool.ImportMedia([movPath]);
    await mediaPool.SetCurrentFolder(prevFolder);
    if (!clips || clips.length === 0) throw new Error('Failed to import to MediaPool');

    // Smart timeline placement
    const timeline = await project.GetCurrentTimeline();
    if (!timeline) throw new Error('No active timeline');

    const tc = await timeline.GetCurrentTimecode();
    const fpsStr = await timeline.GetSetting('timelineFrameRate');
    const fps = parseFloat(fpsStr) || 25;
    const playheadFrame = timecodeToFrame(tc, fps);

    const clip = clips[0];
    const clipProps = await clip.GetClipProperty();
    const clipFrames = parseInt(clipProps.Frames) || Math.round(fps * 5);

    const trackIndex = await findEmptyTrack(timeline, playheadFrame, clipFrames);

    await mediaPool.AppendToTimeline([{
        mediaPoolItem: clip,
        trackIndex,
        recordFrame: playheadFrame,
        mediaType: 1
    }]);
}

async function handleRenderMov(_event, { html, name, fps, width, height }) {
    const cfg = readConfig();
    fps = fps || cfg.fps;
    width = width || cfg.width;
    height = height || cfg.height;
    const tempDir = path.join(os.tmpdir(), 'claude_resolve_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(RENDER_DIR, { recursive: true });

    const htmlPath = path.join(tempDir, 'overlay.html');
    const movPath = path.join(RENDER_DIR, renderFilename(name));
    fs.writeFileSync(htmlPath, html);

    const renderScript = path.join(__dirname, '..', 'renderer', 'render.py');

    console.log('RENDER: python=' + PYTHON_PATH, 'script=' + renderScript, 'html=' + htmlPath, 'out=' + movPath);

    const cleanupTempDir = () => {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); }
        catch (e) { console.log('RENDER TEMP CLEANUP FAILED:', e.message); }
    };

    return new Promise((resolve) => {
        const proc = spawn(PYTHON_PATH, [
            renderScript, htmlPath,
            '--fps', String(fps),
            '--width', String(width),
            '--height', String(height),
            '--output', movPath,
            '--ffmpeg', FFMPEG_PATH
        ]);

        let buf = '';
        let stderrBuf = '';

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

        proc.stderr.on('data', (chunk) => {
            stderrBuf += chunk.toString();
            console.log('RENDER STDERR:', chunk.toString());
        });

        proc.on('close', async (code) => {
            console.log('RENDER EXIT:', code, stderrBuf.slice(0, 500));
            cleanupTempDir();
            if (code !== 0) {
                const errMsg = stderrBuf.trim().split('\n').pop() || 'Render process exited with code ' + code;
                resolve({ success: false, error: errMsg });
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
            console.log('RENDER SPAWN ERROR:', err.message);
            cleanupTempDir();
            resolve({ success: false, error: 'Failed to spawn: ' + err.message });
        });
    });
}

function handleListRenders() {
    if (!fs.existsSync(RENDER_DIR)) return [];
    return fs.readdirSync(RENDER_DIR)
        .filter(f => f.endsWith('.mov'))
        .map(f => {
            const stat = fs.statSync(path.join(RENDER_DIR, f));
            return { name: f, size: stat.size };
        });
}

async function handleSyncToMediaPool() {
    if (!fs.existsSync(RENDER_DIR)) return { synced: 0, total: 0 };
    const files = fs.readdirSync(RENDER_DIR).filter(f => f.endsWith('.mov'));
    if (files.length === 0) return { synced: 0, total: 0 };

    const resolve = await getResolve();
    if (!resolve) return { synced: 0, total: files.length, error: 'Resolve not connected' };

    const project = await getCurrentProject();
    const mediaPool = await project.GetMediaPool();
    const bin = await findOrCreateBin(mediaPool, 'Claude Resolve');

    const existing = await bin.GetClipList();
    const existingNames = new Set();
    for (const clip of (existing || [])) {
        const props = await clip.GetClipProperty();
        if (props['File Name']) existingNames.add(props['File Name']);
    }

    const toImport = files.filter(f => !existingNames.has(f));
    if (toImport.length === 0) return { synced: 0, total: files.length };

    const prevFolder = await mediaPool.GetCurrentFolder();
    await mediaPool.SetCurrentFolder(bin);
    await mediaPool.ImportMedia(toImport.map(f => path.join(RENDER_DIR, f)));
    await mediaPool.SetCurrentFolder(prevFolder);

    return { synced: toImport.length, total: files.length };
}

function handleDeleteRender(_event, name) {
    const p = path.join(RENDER_DIR, name);
    if (!fs.existsSync(p)) return false;
    fs.rmSync(p);
    return true;
}

function handleDeleteAllRenders() {
    if (!fs.existsSync(RENDER_DIR)) return false;
    fs.rmSync(RENDER_DIR, { recursive: true, force: true });
    fs.mkdirSync(RENDER_DIR, { recursive: true });
    return true;
}

function setupOverlayHandlers(ipcMain, win) {
    mainWindow = win;
    ipcMain.handle('overlay:renderMov', handleRenderMov);
    ipcMain.handle('renders:list', handleListRenders);
    ipcMain.handle('renders:delete', handleDeleteRender);
    ipcMain.handle('renders:deleteAll', handleDeleteAllRenders);
    ipcMain.handle('renders:syncToMediaPool', handleSyncToMediaPool);
}

module.exports = { setupOverlayHandlers };
