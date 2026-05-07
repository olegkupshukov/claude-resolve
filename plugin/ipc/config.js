const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(
    process.env.APPDATA,
    'Blackmagic Design', 'DaVinci Resolve', 'Claude Resolve'
);
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const DEFAULTS = { mode: 'mov', model: 'sonnet', fps: 25, width: 1920, height: 1080 };

function readConfig() {
    try {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
    } catch {
        return { ...DEFAULTS };
    }
}

function writeConfig(partial) {
    const config = { ...readConfig(), ...partial };
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return config;
}

function setupConfigHandlers(ipcMain) {
    ipcMain.handle('config:get', () => readConfig());
    ipcMain.handle('config:set', (_e, partial) => writeConfig(partial));
}

module.exports = { setupConfigHandlers, readConfig };
