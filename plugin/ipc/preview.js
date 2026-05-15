// Preview iframe bundle — UMDs + @font-face for the in-app preview iframe.
//
// The preview iframe runs sandboxed (sandbox="allow-scripts", no
// allow-same-origin), so it can't load file:// resources. To get the same
// React/Framer-Motion globals and bundled fonts that render.py provides, we
// inline them into the iframe's srcdoc:
//   - UMDs are concatenated as a script string (used only in realtime mode)
//   - Fonts are emitted as @font-face rules with base64 data: URIs (used by
//     both modes so frame-mode previews also pick up the bundled typefaces)
//
// Files are read once at module load. The bundle is held in memory (~1.2 MB)
// and returned by reference on every IPC call — no re-reading or re-encoding.

const fs = require('fs');
const path = require('path');

const RENDERER_DIR = path.resolve(__dirname, '..', 'renderer');

const UMD_FILES = [
    path.join(RENDERER_DIR, 'vendor', 'react.production.min.js'),
    path.join(RENDERER_DIR, 'vendor', 'react-dom.production.min.js'),
    path.join(RENDERER_DIR, 'vendor', 'framer-motion.js'),
];

// (family, file, mime, format(), font-weight range)
const FONT_FACES = [
    ['Bricolage Grotesque', path.join(RENDERER_DIR, 'fonts', 'BricolageGrotesque-VF.ttf'),   'font/ttf',   'truetype', '200 800'],
    ['Fraunces',            path.join(RENDERER_DIR, 'fonts', 'Fraunces-VF.woff2'),           'font/woff2', 'woff2',    '100 900'],
    ['JetBrains Mono',      path.join(RENDERER_DIR, 'fonts', 'JetBrainsMono-VF.woff2'),      'font/woff2', 'woff2',    '100 800'],
];

function buildBundle() {
    const umdParts = [];
    for (const p of UMD_FILES) {
        const raw = fs.readFileSync(p, 'utf-8');
        // Escape literal </script> inside UMD text so it can't break out of
        // the surrounding <script> tag when inlined into srcdoc.
        umdParts.push(raw.replace(/<\/script>/gi, '<\\/script>'));
    }
    const umd = umdParts.join('\n');

    const faceRules = FONT_FACES.map(([family, file, mime, fmt, weightRange]) => {
        const b64 = fs.readFileSync(file).toString('base64');
        return `@font-face {`
            + ` font-family: "${family}";`
            + ` src: url(data:${mime};base64,${b64}) format("${fmt}");`
            + ` font-weight: ${weightRange};`
            + ` font-display: block;`
            + ` }`;
    }).join('\n');
    const fonts = `<style id="__cr_fonts">${faceRules}</style>`;

    return { umd, fonts };
}

let cached = null;
function getBundle() {
    if (!cached) cached = buildBundle();
    return cached;
}

function setupPreviewHandlers(ipcMain) {
    ipcMain.handle('preview:getRealtimeBundle', () => getBundle());
}

module.exports = { setupPreviewHandlers };
