const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { shell } = require('electron');
const { spawn } = require('child_process');
const { getResolve, getCurrentProject } = require('./resolve');
const { readConfig } = require('./config');
const { validateOverlayHtml } = require('./render-validation');
const { resolveAssetReferences } = require('./assets');
const { createRenderQueue } = require('./render-queue');
const {
    findExecutable, ENV,
    RENDER_DIR, THUMBNAIL_DIR, CONFIG_DIR,
    FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD
} = require('./paths');

// Resolve executable paths at load time — Resolve's Electron has a stripped PATH
const FFMPEG_PATH = findExecutable(FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD);

console.log('RESOLVED: ffmpeg=' + FFMPEG_PATH);

function renderFilename(name) {
    const safe = (name || 'Overlay').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    return `${safe}_${ts}.mov`;
}

function metadataPathFor(name) {
    return path.join(RENDER_DIR, name.replace(/\.mov$/i, '.json'));
}

function thumbnailPathFor(name) {
    return path.join(THUMBNAIL_DIR, name.replace(/\.mov$/i, '.png'));
}

function thumbnailUrlFor(name) {
    const thumbFile = thumbnailPathFor(name);
    return fs.existsSync(thumbFile) ? pathToFileURL(thumbFile).href : null;
}

function readRenderMetadata(name) {
    const metadataPath = metadataPathFor(name);
    if (!fs.existsSync(metadataPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch {
        return null;
    }
}

function writeRenderMetadata(name, metadata) {
    fs.mkdirSync(RENDER_DIR, { recursive: true });
    const next = {
        ...metadata,
        name,
        path: path.join(RENDER_DIR, name),
        thumbnail: thumbnailUrlFor(name),
        updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(metadataPathFor(name), JSON.stringify(next, null, 2), 'utf8');
    return next;
}

let mainWindow = null;
const RENDER_QUEUE_PATH = path.join(CONFIG_DIR, 'render-queue.json');

function readQueueJobs() {
    try {
        const parsed = JSON.parse(fs.readFileSync(RENDER_QUEUE_PATH, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeQueueJobs(jobs) {
    fs.mkdirSync(path.dirname(RENDER_QUEUE_PATH), { recursive: true });
    fs.writeFileSync(RENDER_QUEUE_PATH, JSON.stringify(jobs, null, 2), 'utf8');
}

const renderQueue = createRenderQueue(readQueueJobs());
const activeRenderProcesses = new Map();

function persistQueue() {
    writeQueueJobs(renderQueue.list());
    return renderQueue.list();
}

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

    // Import into the Resolve AI bin
    const prevFolder = await mediaPool.GetCurrentFolder();
    const bin = await findOrCreateBin(mediaPool, 'Resolve AI');
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

async function handleRenderMov(_event, { html, name, fps, width, height, metadata }) {
    const cfg = readConfig();
    fps = fps || cfg.fps;
    width = width || cfg.width;
    height = height || cfg.height;
    html = resolveAssetReferences(html, metadata?.selectedAssetIds || cfg.selectedAssetIds || []);
    const tempDir = path.join(os.tmpdir(), 'claude_resolve_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(RENDER_DIR, { recursive: true });

    const htmlPath = path.join(tempDir, 'overlay.html');
    const movPath = path.join(RENDER_DIR, renderFilename(name));
    const movName = path.basename(movPath);
    fs.writeFileSync(htmlPath, html);

    const renderScript = path.join(__dirname, '..', 'renderer', 'render.js');

    console.log('RENDER: script=' + renderScript, 'html=' + htmlPath, 'out=' + movPath);

    const cleanupTempDir = () => {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); }
        catch (e) { console.log('RENDER TEMP CLEANUP FAILED:', e.message); }
    };

    return new Promise((resolve) => {
        // Run render.js with the bundled Electron acting as plain Node
        // (ELECTRON_RUN_AS_NODE) — no dependency on a system `node` or PATH.
        const proc = spawn(process.execPath, [
            renderScript, htmlPath,
            '--fps', String(fps),
            '--width', String(width),
            '--height', String(height),
            '--output', movPath,
            '--ffmpeg', FFMPEG_PATH
        ], { env: { ...ENV, ELECTRON_RUN_AS_NODE: '1' } });
        const queueId = metadata?.renderQueueId;
        if (queueId) activeRenderProcesses.set(queueId, proc);

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
            if (queueId) activeRenderProcesses.delete(queueId);
            cleanupTempDir();
            if (code !== 0) {
                const errMsg = stderrBuf.trim().split('\n').pop() || 'Render process exited with code ' + code;
                resolve({ success: false, error: errMsg });
                return;
            }
            const renderMetadata = writeRenderMetadata(movName, {
                ...(metadata || {}),
                title: name || movName.replace(/\.mov$/i, ''),
                html,
                fps,
                width,
                height,
                size: fs.existsSync(movPath) ? fs.statSync(movPath).size : null,
                createdAt: metadata?.createdAt || new Date().toISOString()
            });
            try {
                await importToTimeline(movPath);
                resolve({ success: true, path: movPath, name: movName, metadata: renderMetadata });
            } catch (err) {
                resolve({ success: true, path: movPath, name: movName, metadata: renderMetadata, warning: 'Rendered but import failed: ' + err.message });
            }
        });

        proc.on('error', (err) => {
            console.log('RENDER SPAWN ERROR:', err.message);
            if (queueId) activeRenderProcesses.delete(queueId);
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
            const thumbnail = thumbnailUrlFor(f);
            const metadata = readRenderMetadata(f);
            return {
                name: f,
                size: stat.size,
                thumbnail,
                createdAt: stat.birthtime?.toISOString?.() || null,
                updatedAt: stat.mtime?.toISOString?.() || null,
                metadata: metadata ? { ...metadata, thumbnail: metadata.thumbnail || thumbnail } : null
            };
        })
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

async function handleSyncToMediaPool() {
    if (!fs.existsSync(RENDER_DIR)) return { synced: 0, total: 0 };
    const files = fs.readdirSync(RENDER_DIR).filter(f => f.endsWith('.mov'));
    if (files.length === 0) return { synced: 0, total: 0 };

    const resolve = await getResolve();
    if (!resolve) return { synced: 0, total: files.length, error: 'Resolve not connected' };

    const project = await getCurrentProject();
    const mediaPool = await project.GetMediaPool();
    const bin = await findOrCreateBin(mediaPool, 'Resolve AI');

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
    const thumb = thumbnailPathFor(name);
    if (fs.existsSync(thumb)) fs.rmSync(thumb);
    const metadata = metadataPathFor(name);
    if (fs.existsSync(metadata)) fs.rmSync(metadata);
    return true;
}

function handleRenameRender(_event, name, nextName) {
    const source = path.join(RENDER_DIR, name);
    if (!fs.existsSync(source)) return { success: false, error: 'Render not found' };

    const safeBase = String(nextName || '')
        .replace(/\.mov$/i, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/^_+|_+$/g, '') || name.replace(/\.mov$/i, '');
    const targetName = `${safeBase}.mov`;
    const target = path.join(RENDER_DIR, targetName);
    if (fs.existsSync(target)) return { success: false, error: 'A render with that name already exists' };

    fs.renameSync(source, target);

    const oldThumb = thumbnailPathFor(name);
    const newThumb = thumbnailPathFor(targetName);
    if (fs.existsSync(oldThumb)) fs.renameSync(oldThumb, newThumb);

    const oldMetadata = readRenderMetadata(name) || {};
    const oldMetadataPath = metadataPathFor(name);
    if (fs.existsSync(oldMetadataPath)) fs.rmSync(oldMetadataPath);
    const metadata = writeRenderMetadata(targetName, oldMetadata);

    return { success: true, name: targetName, metadata };
}

function handleRevealRender(_event, name) {
    const p = path.join(RENDER_DIR, name);
    if (!fs.existsSync(p)) return false;
    shell.showItemInFolder(p);
    return true;
}

function handleDeleteAllRenders() {
    if (!fs.existsSync(RENDER_DIR)) return false;
    fs.rmSync(RENDER_DIR, { recursive: true, force: true });
    fs.mkdirSync(RENDER_DIR, { recursive: true });
    return true;
}

function handleValidateOverlay(_event, input) {
    return validateOverlayHtml(input);
}

function handleRenderQueue(_event, payload = {}) {
    const action = payload.action || 'list';
    let result = null;
    if (action === 'enqueue') result = renderQueue.enqueue(payload.job || {});
    else if (action === 'start') result = renderQueue.start(payload.id);
    else if (action === 'complete') result = renderQueue.complete(payload.id, payload.result);
    else if (action === 'fail') result = renderQueue.fail(payload.id, payload.error);
    else if (action === 'cancel') {
        const proc = activeRenderProcesses.get(payload.id);
        if (proc) {
            try { proc.kill('SIGTERM'); } catch { /* ignore */ }
            activeRenderProcesses.delete(payload.id);
        }
        result = renderQueue.cancel(payload.id);
    }
    else if (action === 'retry') result = renderQueue.retry(payload.id);
    else if (action === 'clearCompleted') result = { cleared: renderQueue.clearCompleted() };
    return { success: true, action, result, jobs: persistQueue() };
}

function setupOverlayHandlers(ipcMain, win) {
    mainWindow = win;
    ipcMain.handle('overlay:renderMov', handleRenderMov);
    ipcMain.handle('overlay:validate', handleValidateOverlay);
    ipcMain.handle('renders:list', handleListRenders);
    ipcMain.handle('renders:delete', handleDeleteRender);
    ipcMain.handle('renders:rename', handleRenameRender);
    ipcMain.handle('renders:reveal', handleRevealRender);
    ipcMain.handle('renders:deleteAll', handleDeleteAllRenders);
    ipcMain.handle('renders:syncToMediaPool', handleSyncToMediaPool);
    ipcMain.handle('renders:queue', handleRenderQueue);
}

module.exports = { setupOverlayHandlers };
