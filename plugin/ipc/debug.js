const fs = require('fs');
const path = require('path');
const os = require('os');
const { clipboard } = require('electron');
const { CONFIG_DIR, RENDER_DIR } = require('./paths');
const { readConfig } = require('./config');
const { readAssets } = require('./assets');

const DEBUG_DIR = path.join(CONFIG_DIR, 'debug-bundles');

function scrub(value) {
    const home = os.homedir().replace(/\\/g, '/');
    const text = String(value || '').replace(/\\/g, '/');
    return home ? text.replaceAll(home, '<HOME>') : text;
}

function scrubConfig(config) {
    const clone = JSON.parse(JSON.stringify(config || {}));
    if (clone.brandKit?.logoPath) clone.brandKit.logoPath = scrub(clone.brandKit.logoPath);
    return clone;
}

function createDebugBundle(options = {}) {
    const now = new Date().toISOString();
    const safeName = now.replace(/[-:T.]/g, '').slice(0, 14);
    const filePath = path.join(options.debugDir || DEBUG_DIR, `resolve-ai-debug-${safeName}.json`);
    const renders = fs.existsSync(RENDER_DIR)
        ? fs.readdirSync(RENDER_DIR).filter(name => name.endsWith('.mov')).slice(0, 100)
        : [];
    const assets = readAssets().map(asset => ({
        id: asset.id,
        name: asset.name,
        category: asset.category,
        exists: asset.exists,
        size: asset.size,
        path: scrub(asset.path)
    }));
    const bundle = {
        createdAt: now,
        app: {
            name: 'Resolve AI',
            packageVersion: safeReadPackageVersion()
        },
        platform: {
            os: process.platform,
            arch: process.arch,
            node: process.version
        },
        config: scrubConfig(readConfig()),
        assets,
        renders: renders.map(name => scrub(path.join(RENDER_DIR, name))),
        notes: 'Local diagnostic bundle. Review before sharing publicly.'
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const serialized = JSON.stringify(bundle, null, 2);
    fs.writeFileSync(filePath, serialized, 'utf8');
    if (clipboard?.writeText) clipboard.writeText(serialized);
    return { success: true, path: filePath, summary: { assets: assets.length, renders: renders.length } };
}

function safeReadPackageVersion() {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || null;
    } catch {
        return null;
    }
}

function setupDebugHandlers(ipcMain) {
    ipcMain.handle('debug:createBundle', (_event, options) => createDebugBundle(options));
}

module.exports = {
    createDebugBundle,
    scrub,
    setupDebugHandlers
};
