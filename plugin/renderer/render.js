/*
 * Claude Resolve — Playwright .mov Renderer
 *
 * Pre-loads via page.addInitScript (before any HTML <script>):
 *   - window.React, window.ReactDOM (React 18 UMD)
 *   - window.Motion             (Framer Motion v10 UMD; exposes motion, AnimatePresence, etc.)
 *   - @font-face for "Bricolage Grotesque", "Fraunces", "JetBrains Mono"
 *   - deterministic clock hijack: performance.now / Date.now /
 *     requestAnimationFrame / Element.prototype.animate (WAAPI)
 *
 * Modes (auto-detected per HTML):
 *   - frame:            HTML implements window.renderFrame(frame, fps); renderer
 *                       calls it for each frame then screenshots.
 *   - realtime-precise: HTML doesn't implement renderFrame. The clock hijack
 *                       (installed before any HTML script) freezes time, so
 *                       React/Framer Motion mount at t=0 with entrance
 *                       animations queued; the renderer then steps time
 *                       manually so springs, layout and WAAPI-accelerated
 *                       animations settle deterministically per frame.
 *
 * Required HTML API:
 *   - window.getAnimationDuration() -> positive number (seconds). Hard-clamped at
 *     MAX_DURATION_SEC; durations above that are clamped with a 'warning' emit.
 *
 * Outputs ProRes 4444 .mov (yuva444p10le, alpha channel).
 * JSON progress lines emitted to stdout for the plugin's IPC stream.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const RENDERER_DIR = __dirname;
const VENDOR_DIR = path.join(RENDERER_DIR, 'vendor');
const FONTS_DIR = path.join(RENDERER_DIR, 'fonts');

const MAX_DURATION_SEC = 30;
const FONT_READY_TIMEOUT_MS = 5000;

const UMD_FILES = [
    path.join(VENDOR_DIR, 'react.production.min.js'),
    path.join(VENDOR_DIR, 'react-dom.production.min.js'),
    path.join(VENDOR_DIR, 'framer-motion.js'),
];

// [family, file, format, weight-range]
const FONT_FACES = [
    ['Bricolage Grotesque', path.join(FONTS_DIR, 'BricolageGrotesque-VF.ttf'), 'truetype', '200 800'],
    ['Fraunces', path.join(FONTS_DIR, 'Fraunces-VF.woff2'), 'woff2', '100 900'],
    ['JetBrains Mono', path.join(FONTS_DIR, 'JetBrainsMono-VF.woff2'), 'woff2', '100 800'],
];

function emit(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}

// Fatal error: emit the structured JSON event (stdout) AND mirror one flat
// line to stderr — the parent prefers the JSON event but keeps stderr as a
// fallback, so the real message survives either way.
function fatal(message) {
    emit({ type: 'error', message });
    process.stderr.write('ERROR: ' + String(message).replace(/\s*\n\s*/g, ' ').slice(0, 500) + '\n');
    process.exit(1);
}

function pad6(n) {
    return String(n).padStart(6, '0');
}

// Deterministic clock + animation hijack. Installed via addInitScript so it
// runs before ANY HTML <script> — React and Framer Motion mount on a clock
// frozen at t=0, with their entrance animations queued, not played:
//   - performance.now / Date.now -> return window.__renderTime while active
//   - requestAnimationFrame      -> callbacks queued, fired only by __stepFrame
//   - Element.prototype.animate  -> WAAPI animations paused on creation and
//     driven by __stepFrame. FM v10 offloads opacity/transform to WAAPI, which
//     the performance.now / rAF overrides alone cannot reach — without this an
//     entrance animation plays in real wall-clock time during page load and is
//     already settled before the first frame is stepped.
const TIME_HIJACK = `
(() => {
    if (window.__renderHijack) return;
    window.__renderHijack = true;
    window.__renderTime = 0;
    window.__renderActive = true;

    const origPerfNow = performance.now.bind(performance);
    performance.now = () => window.__renderActive ? window.__renderTime : origPerfNow();
    const origDateNow = Date.now.bind(Date);
    Date.now = () => window.__renderActive ? window.__renderTime : origDateNow();

    const callbacks = [];
    window.requestAnimationFrame = (cb) => { callbacks.push(cb); return callbacks.length; };

    // WAAPI: pause every animation on creation, remember the render-time it
    // was created at, then drive its currentTime from __stepFrame.
    const waapiAnims = [];
    const origAnimate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
        const anim = origAnimate.call(this, keyframes, options);
        if (window.__renderActive) {
            try { anim.pause(); } catch (_) {}
            waapiAnims.push({ anim: anim, startTime: window.__renderTime });
        }
        return anim;
    };

    window.__stepFrame = (timeMs) => {
        window.__renderTime = timeMs;
        const cbs = callbacks.splice(0);
        cbs.forEach((cb) => { try { cb(timeMs); } catch (_) {} });
        for (const rec of waapiAnims) {
            try {
                const local = timeMs - rec.startTime;
                rec.anim.currentTime = local < 0 ? 0 : local;
            } catch (_) {}
        }
    };
})();
`;

// Time hijack + concatenated UMD bundles + font injector. Runs in the page's
// main world before any HTML script. UMDs assign window.React / window.ReactDOM
// / window.Motion themselves; font injector polls for <head> then appends a
// <style> with @font-face rules using file:// URLs.
function buildInitScript() {
    const umdBlobs = [];
    for (const p of UMD_FILES) {
        if (!fs.existsSync(p)) throw new Error(`Missing vendor file: ${p}`);
        umdBlobs.push(fs.readFileSync(p, 'utf-8'));
    }

    const fontRules = [];
    for (const [family, p, fmt, weightRange] of FONT_FACES) {
        if (!fs.existsSync(p)) throw new Error(`Missing font file: ${p}`);
        const uri = pathToFileURL(p).href; // absolute file:// URL
        fontRules.push(
            `@font-face { ` +
            `font-family: "${family}"; ` +
            `src: url("${uri}") format("${fmt}"); ` +
            `font-weight: ${weightRange}; ` +
            `font-display: block; ` +
            `}`
        );
    }
    const fontCss = fontRules.join(' ');

    const fontInjector =
        '(function(){' +
        'function inject(){' +
        'if(!document.head){setTimeout(inject,0);return;}' +
        "if(document.getElementById('__cr_fonts'))return;" +
        "var s=document.createElement('style');" +
        "s.id='__cr_fonts';" +
        `s.textContent=${JSON.stringify(fontCss)};` +
        'document.head.appendChild(s);' +
        '}' +
        'inject();' +
        '})();';

    return TIME_HIJACK + '\n' + umdBlobs.join('\n') + '\n' + fontInjector;
}

async function detectMode(page) {
    const hasRenderFrame = await page.evaluate("typeof window.renderFrame === 'function'");
    return hasRenderFrame ? 'frame' : 'realtime-precise';
}

async function renderFrameMode(page, args, framesDir, totalFrames) {
    for (let frame = 0; frame < totalFrames; frame++) {
        await page.evaluate(`window.renderFrame(${frame}, ${args.fps})`);
        const p = path.join(framesDir, `frame_${pad6(frame)}.png`);
        await page.screenshot({ path: p, omitBackground: true });
        if (frame % 10 === 0 || frame === totalFrames - 1) {
            const pct = Math.round((frame + 1) / totalFrames * 100);
            emit({ type: 'progress', frame: frame + 1, total: totalFrames, percent: pct });
        }
    }
}

// Step the browser clock manually per frame. The clock + animation hijack
// (performance.now / Date.now / rAF / WAAPI) is installed via addInitScript,
// so React and Framer Motion already mounted with the clock frozen at t=0 and
// their entrance animations queued — not yet played.
async function renderRealtimePreciseMode(page, args, framesDir, totalFrames) {
    // Let React finish mounting and Framer Motion register its animations,
    // all at the frozen t=0, before we start stepping the clock.
    await page.waitForTimeout(500);
    await page.evaluate('window.__stepFrame(0)');

    for (let frame = 0; frame < totalFrames; frame++) {
        const tMs = (frame / args.fps) * 1000.0;
        // Multiple sub-steps per frame so Framer Motion springs settle smoothly
        for (let k = 0; k < 3; k++) {
            const sub = tMs + (k / 3.0) * (1000.0 / args.fps);
            await page.evaluate(`window.__stepFrame(${sub})`);
        }
        // Let the DOM commit
        await page.waitForTimeout(8);
        const p = path.join(framesDir, `frame_${pad6(frame)}.png`);
        await page.screenshot({ path: p, omitBackground: true });
        if (frame % 10 === 0 || frame === totalFrames - 1) {
            const pct = Math.round((frame + 1) / totalFrames * 100);
            emit({ type: 'progress', frame: frame + 1, total: totalFrames, percent: pct });
        }
    }

    await page.evaluate('window.__renderActive = false');
}

function parseArgs(argv) {
    const args = { fps: 25, width: 1920, height: 1080, output: null, ffmpeg: 'ffmpeg', htmlPath: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--fps') args.fps = parseInt(argv[++i], 10);
        else if (a === '--width') args.width = parseInt(argv[++i], 10);
        else if (a === '--height') args.height = parseInt(argv[++i], 10);
        else if (a === '--output') args.output = argv[++i];
        else if (a === '--ffmpeg') args.ffmpeg = argv[++i];
        else if (!args.htmlPath) args.htmlPath = a;
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    // Resolve runs this under its bundled Electron as Node (ELECTRON_RUN_AS_NODE).
    // Playwright needs Node 18+ — fail with a clear message instead of a cryptic
    // module-load error if that runtime is too old.
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
        fatal(`Renderer needs Node 18+, but the bundled runtime is Node ${process.versions.node}.`);
    }

    if (!args.htmlPath) {
        fatal('Missing HTML path argument');
    }
    if (!args.output) {
        fatal('Missing --output argument');
    }

    const htmlPath = path.resolve(args.htmlPath);
    if (!fs.existsSync(htmlPath)) {
        fatal(`HTML file not found: ${htmlPath}`);
    }

    let initScript;
    try {
        initScript = buildInitScript();
    } catch (e) {
        fatal(e.message);
    }

    // Pre-flight: verify the Playwright Chromium build exists before doing any
    // work, so a missing/corrupt browser cache fails in seconds with an
    // actionable message instead of an opaque launch() stack.
    let chromiumPath = null;
    try { chromiumPath = chromium.executablePath(); } catch (_e) { /* not installed */ }
    if (!chromiumPath || !fs.existsSync(chromiumPath)) {
        fatal('Playwright Chromium not found' + (chromiumPath ? ` at ${chromiumPath}` : '') +
            '. Re-run the installer, or run "npx playwright install chromium" in plugin/renderer' +
            ' (see README troubleshooting if antivirus blocked the download).');
    }

    const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude_resolve_frames_'));

    try {
        const browser = await chromium.launch();
        const page = await browser.newPage({
            viewport: { width: args.width, height: args.height },
            deviceScaleFactor: 1,
        });

        await page.addInitScript(initScript);
        await page.goto(pathToFileURL(htmlPath).href);
        await page.waitForLoadState('networkidle');

        try {
            await page.waitForFunction('document.fonts.ready', null, { timeout: FONT_READY_TIMEOUT_MS });
        } catch (_e) {
            emit({ type: 'warning', message: 'document.fonts.ready timed out' });
        }

        // Extra settle for font decode + initial paint
        await page.waitForTimeout(200);

        let duration = await page.evaluate('window.getAnimationDuration()');
        if (typeof duration !== 'number' || !isFinite(duration) || duration <= 0) {
            fatal(`getAnimationDuration returned invalid value: ${JSON.stringify(duration)}`);
        }

        let clamped = false;
        if (duration > MAX_DURATION_SEC) {
            duration = MAX_DURATION_SEC;
            clamped = true;
        }

        const totalFrames = Math.floor(duration * args.fps);
        if (totalFrames <= 0) {
            fatal(`Computed 0 frames (duration=${duration}, fps=${args.fps})`);
        }

        const mode = await detectMode(page);
        emit({ type: 'mode_detected', mode });
        if (clamped) {
            emit({ type: 'warning', message: `duration clamped to ${MAX_DURATION_SEC}s` });
        }

        emit({ type: 'start', totalFrames, duration, mode });

        if (mode === 'frame') {
            await renderFrameMode(page, args, framesDir, totalFrames);
        } else {
            await renderRealtimePreciseMode(page, args, framesDir, totalFrames);
        }

        // Save a sidebar thumbnail from ~85% through the animation —
        // late enough to show the resolved state, before any fade-out.
        const thumbIdx = Math.min(totalFrames - 1, Math.max(0, Math.floor(totalFrames * 0.85)));
        const thumbSrc = path.join(framesDir, `frame_${pad6(thumbIdx)}.png`);
        if (fs.existsSync(thumbSrc)) {
            try {
                const outResolved = path.resolve(args.output);
                const thumbDir = path.join(path.dirname(outResolved), 'thumbnails');
                fs.mkdirSync(thumbDir, { recursive: true });
                const thumbDst = path.join(thumbDir, path.basename(outResolved, path.extname(outResolved)) + '.png');
                fs.copyFileSync(thumbSrc, thumbDst);
                emit({ type: 'thumbnail', path: thumbDst });
            } catch (e) {
                emit({ type: 'warning', message: `thumbnail save failed: ${e.message}` });
            }
        }

        await browser.close();

        const ffmpegArgs = [
            '-y',
            '-framerate', String(args.fps),
            '-i', path.join(framesDir, 'frame_%06d.png'),
            '-c:v', 'prores_ks',
            '-profile:v', '4444',
            '-pix_fmt', 'yuva444p10le',
            '-vendor', 'apl0',
            args.output,
        ];

        emit({ type: 'encoding' });
        const result = spawnSync(args.ffmpeg, ffmpegArgs, { encoding: 'utf-8' });

        if (result.error) {
            fatal(`FFmpeg failed to spawn: ${result.error.message}`);
        }
        if (result.status !== 0) {
            fatal(`FFmpeg failed: ${(result.stderr || '').slice(0, 500)}`);
        }

        emit({ type: 'done', output: args.output });
    } finally {
        fs.rmSync(framesDir, { recursive: true, force: true });
    }
}

main()
    .then(() => {
        // Exit explicitly — Playwright/Electron-as-Node can leave the event
        // loop alive after browser.close(), so a natural return would hang
        // the parent process (which waits on the 'close' event).
        process.exit(0);
    })
    .catch((err) => {
        fatal(err && err.message ? err.message : String(err));
    });
