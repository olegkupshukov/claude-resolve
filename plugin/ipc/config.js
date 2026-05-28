const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./paths');

const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_BRAND_KIT = {
    colors: '',
    fonts: '',
    logoPath: '',
    tone: '',
    phrases: ''
};

const DEFAULTS = {
    provider: 'auto',
    model: 'sonnet',
    codexModel: 'default',
    fps: 25,
    width: 1920,
    height: 1080,
    brandKit: DEFAULT_BRAND_KIT,
    promptPresets: [],
    savedTemplates: [],
    selectedAssetIds: [],
    generation: {
        variationCount: 3,
        locks: {
            logo: false,
            colors: false,
            layout: false,
            animationOnly: false
        }
    },
    captions: {
        defaultStyle: 'clean'
    },
    assets: {
        maxImportSizeMb: 25
    },
    ui: {
        rawLogsOpen: false,
        activeToolTab: 'create'
    },
    gallery: {
        favorites: [],
        recentIds: []
    }
};

function mergeConfig(parsed = {}) {
    return {
        ...DEFAULTS,
        ...parsed,
        brandKit: { ...DEFAULT_BRAND_KIT, ...(parsed.brandKit || {}) },
        selectedAssetIds: Array.isArray(parsed.selectedAssetIds) ? parsed.selectedAssetIds : [],
        generation: {
            ...(DEFAULTS.generation || {}),
            ...(parsed.generation || {}),
            locks: {
                ...(DEFAULTS.generation.locks || {}),
                ...((parsed.generation || {}).locks || {})
            }
        },
        captions: { ...(DEFAULTS.captions || {}), ...(parsed.captions || {}) },
        assets: { ...(DEFAULTS.assets || {}), ...(parsed.assets || {}) },
        ui: { ...(DEFAULTS.ui || {}), ...(parsed.ui || {}) },
        gallery: {
            ...(DEFAULTS.gallery || {}),
            ...(parsed.gallery || {}),
            favorites: Array.isArray(parsed.gallery?.favorites) ? parsed.gallery.favorites : [],
            recentIds: Array.isArray(parsed.gallery?.recentIds) ? parsed.gallery.recentIds : []
        }
    };
}

function readConfig() {
    try {
        return mergeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')));
    } catch {
        return mergeConfig();
    }
}

function writeConfig(partial) {
    const current = readConfig();
    const config = {
        ...current,
        ...partial,
        brandKit: { ...DEFAULT_BRAND_KIT, ...(current.brandKit || {}), ...(partial.brandKit || {}) },
        selectedAssetIds: Array.isArray(partial.selectedAssetIds) ? partial.selectedAssetIds : current.selectedAssetIds,
        generation: {
            ...(current.generation || DEFAULTS.generation),
            ...(partial.generation || {}),
            locks: {
                ...((current.generation || DEFAULTS.generation).locks || {}),
                ...((partial.generation || {}).locks || {})
            }
        },
        captions: { ...(current.captions || DEFAULTS.captions), ...(partial.captions || {}) },
        assets: { ...(current.assets || DEFAULTS.assets), ...(partial.assets || {}) },
        ui: { ...(current.ui || {}), ...(partial.ui || {}) },
        gallery: {
            ...(current.gallery || DEFAULTS.gallery),
            ...(partial.gallery || {}),
            favorites: Array.isArray(partial.gallery?.favorites)
                ? partial.gallery.favorites
                : (current.gallery?.favorites || []),
            recentIds: Array.isArray(partial.gallery?.recentIds)
                ? partial.gallery.recentIds
                : (current.gallery?.recentIds || [])
        }
    };
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return config;
}

function setupConfigHandlers(ipcMain) {
    ipcMain.handle('config:get', () => readConfig());
    ipcMain.handle('config:set', (_e, partial) => writeConfig(partial));
    ipcMain.handle('brand:get', () => readConfig().brandKit || DEFAULT_BRAND_KIT);
    ipcMain.handle('brand:set', (_e, brandKit) => writeConfig({ brandKit }).brandKit);
}

module.exports = { setupConfigHandlers, readConfig, writeConfig, mergeConfig, DEFAULT_BRAND_KIT };
