const fs = require('fs');
const path = require('path');

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

function setupOverlayHandlers(ipcMain) {
    ipcMain.handle('overlay:save', handleOverlaySave);
    ipcMain.handle('templates:list', handleListTemplates);
    ipcMain.handle('templates:delete', handleDeleteTemplate);
    ipcMain.handle('templates:deleteAll', handleDeleteAllTemplates);
}

module.exports = { setupOverlayHandlers };
