const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { shell } = require('electron');
const { spawn } = require('child_process');
const { getResolve, getCurrentProject } = require('./resolve');
const { readConfig } = require('./config');
const {
    findExecutable, ENV, PLAYWRIGHT_BROWSERS_PATH,
    RENDER_DIR, THUMBNAIL_DIR,
    FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD
} = require('./paths');

// Resolve ffmpeg at load time (Resolve's Electron has a stripped PATH), but
// re-resolve when the cached path doesn't exist: findExecutable's last resort
// is candidates[0] — a path that may not exist — and ffmpeg can be installed
// while Resolve is already running.
let ffmpegPath = findExecutable(FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD);

console.log('RESOLVED: ffmpeg=' + ffmpegPath);

function resolveFfmpeg() {
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
    ffmpegPath = findExecutable(FFMPEG_CANDIDATES, FFMPEG_VERIFY_CMD);
    return (ffmpegPath && fs.existsSync(ffmpegPath)) ? ffmpegPath : null;
}

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
    // Search from V2 upward for an empty slot at playhead on a usable track.
    // A locked or disabled track silently rejects AppendToTimeline, so skip those.
    for (let t = 2; t <= trackCount; t++) {
        const locked = await timeline.GetIsTrackLocked('video', t);
        const enabled = await timeline.GetIsTrackEnabled('video', t);
        if (locked || !enabled) continue;

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
    // No usable existing track (all occupied, locked, or disabled) — add one new
    // track. A freshly added track is unlocked and enabled by default.
    await timeline.AddTrack('video');
    return trackCount + 1;
}

// Imports the rendered .mov and tries to place it on the timeline.
// Returns a structured result instead of throwing, so the caller can tell the
// user exactly what happened:
//   { imported: false, placed: false, reason } — couldn't even reach the bin
//   { imported: true,  placed: false, reason } — in the bin, not on the timeline
//   { imported: true,  placed: true,  track  } — on the timeline
async function importToTimeline(movPath) {
    const resolve = await getResolve();
    if (!resolve) return { imported: false, placed: false, reason: 'Resolve is not connected' };

    const project = await getCurrentProject();
    if (!project) return { imported: false, placed: false, reason: 'no project is open' };
    const mediaPool = await project.GetMediaPool();

    // Stage 1 — import into the "Claude Resolve" bin. This must always run and
    // succeed first, so the rendered clip is never lost even if placement fails.
    const prevFolder = await mediaPool.GetCurrentFolder();
    const bin = await findOrCreateBin(mediaPool, 'Claude Resolve');
    await mediaPool.SetCurrentFolder(bin);
    const clips = await mediaPool.ImportMedia([movPath]);
    await mediaPool.SetCurrentFolder(prevFolder);
    if (!clips || clips.length === 0) {
        return { imported: false, placed: false, reason: 'could not import the file into the Media Pool' };
    }
    const clip = clips[0];

    // Stage 2 — best-effort timeline placement. Any failure here leaves the clip
    // safely in the bin and reports imported-but-not-placed with a reason.
    try {
        const timeline = await project.GetCurrentTimeline();
        if (!timeline) return { imported: true, placed: false, reason: 'no timeline is open' };

        const tc = await timeline.GetCurrentTimecode();
        const fpsStr = await timeline.GetSetting('timelineFrameRate');
        const fps = parseFloat(fpsStr) || 25;
        const playheadFrame = timecodeToFrame(tc, fps);

        const clipProps = await clip.GetClipProperty();
        const clipFrames = parseInt(clipProps.Frames) || Math.round(fps * 5);

        const trackIndex = await findEmptyTrack(timeline, playheadFrame, clipFrames);

        // Diagnostic (step 4): capture placement inputs/outputs to confirm the
        // per-user trigger. recordFrame offset math is intentionally unchanged
        // until a real log tells us which semantics this build uses.
        let startFrame = null, endFrame = null;
        try {
            startFrame = await timeline.GetStartFrame();
            endFrame = await timeline.GetEndFrame();
        } catch (_e) { /* older builds may lack these getters */ }

        const appended = await mediaPool.AppendToTimeline([{
            mediaPoolItem: clip,
            trackIndex,
            recordFrame: playheadFrame,
            mediaType: 1
        }]);

        const placedCount = Array.isArray(appended) ? appended.length : (appended ? 1 : 0);
        console.log('IMPORT PLACEMENT:', JSON.stringify({
            timecode: tc, fps, recordFrame: playheadFrame, trackIndex,
            timelineStartFrame: startFrame, timelineEndFrame: endFrame,
            clipFrames, appended: placedCount
        }));

        if (placedCount === 0) {
            return {
                imported: true,
                placed: false,
                reason: `Resolve rejected placement on track V${trackIndex} at frame ${playheadFrame}`
            };
        }
        return { imported: true, placed: true, track: trackIndex };
    } catch (err) {
        return { imported: true, placed: false, reason: err.message };
    }
}

async function handleRenderMov(_event, { html, name, fps, width, height }) {
    // Pre-flight: fail in <1s with an actionable message when ffmpeg is
    // missing, instead of after a full frame render.
    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
        return {
            success: false,
            error: 'ffmpeg not found. Install it — "winget install Gyan.FFmpeg" (Windows) or ' +
                '"brew install ffmpeg" (macOS) — then render again. ' +
                'If it is installed but still not found, restart Resolve.'
        };
    }

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
            '--ffmpeg', ffmpeg
        ], { env: { ...ENV, ELECTRON_RUN_AS_NODE: '1', PLAYWRIGHT_BROWSERS_PATH } });

        let buf = '';
        let stderrBuf = '';
        let lastError = null;

        proc.stdout.on('data', (chunk) => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    // The renderer reports its real failure as a JSON event on
                    // stdout — keep the last one for the close handler.
                    if (msg.type === 'error' && msg.message) lastError = msg.message;
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
                // Prefer the renderer's structured error; stderr's last
                // non-empty line is the fallback (e.g. an uncaught crash).
                const stderrLine = stderrBuf.split('\n').map(l => l.trim()).filter(Boolean).pop();
                const errMsg = lastError || stderrLine || 'Render process exited with code ' + code;
                resolve({ success: false, error: errMsg });
                return;
            }
            // Clean exit — verify the encoder actually produced the file
            // before reporting success.
            let movSize = 0;
            try { movSize = fs.statSync(movPath).size; } catch (_e) { /* missing */ }
            if (movSize === 0) {
                resolve({ success: false, error: 'Render finished but no .mov was produced (encoder output missing or empty)' });
                return;
            }
            try {
                const r = await importToTimeline(movPath);
                resolve({
                    success: true,
                    path: movPath,
                    placed: r.placed,
                    imported: r.imported,
                    reason: r.reason || null
                });
            } catch (err) {
                // Defensive: importToTimeline is structured and shouldn't throw,
                // but never let an unexpected error hide a successful render.
                resolve({ success: true, path: movPath, placed: false, imported: false, reason: err.message });
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
            const thumbFile = path.join(THUMBNAIL_DIR, f.slice(0, -4) + '.png');
            const thumbnail = fs.existsSync(thumbFile) ? pathToFileURL(thumbFile).href : null;
            return { name: f, size: stat.size, thumbnail };
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
    const thumb = path.join(THUMBNAIL_DIR, name.replace(/\.mov$/i, '.png'));
    if (fs.existsSync(thumb)) fs.rmSync(thumb);
    return true;
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

function setupOverlayHandlers(ipcMain, win) {
    mainWindow = win;
    ipcMain.handle('overlay:renderMov', handleRenderMov);
    ipcMain.handle('renders:list', handleListRenders);
    ipcMain.handle('renders:delete', handleDeleteRender);
    ipcMain.handle('renders:reveal', handleRevealRender);
    ipcMain.handle('renders:deleteAll', handleDeleteAllRenders);
    ipcMain.handle('renders:syncToMediaPool', handleSyncToMediaPool);
}

module.exports = { setupOverlayHandlers };
