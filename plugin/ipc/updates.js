const https = require('https');
const { version: CURRENT_VERSION } = require('../package.json');

const RELEASES_URL = 'https://api.github.com/repos/olegkupshukov/claude-resolve/releases?per_page=10';
const CACHE_TTL_MS = 60 * 60 * 1000;

let cached = null;

function parseVersion(tag) {
    const cleaned = String(tag).replace(/^v/, '').split('-')[0];
    const parts = cleaned.split('.').map(n => parseInt(n, 10));
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
}

function isNewer(latest, current) {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

function fetchLatestRelease() {
    return new Promise((resolve, reject) => {
        const req = https.get(RELEASES_URL, {
            headers: { 'User-Agent': 'claude-resolve', 'Accept': 'application/vnd.github+json' },
            timeout: 8000
        }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                if (res.statusCode === 403) return reject(new Error('rate-limited'));
                if (res.statusCode === 404) return reject(new Error('no-releases'));
                if (res.statusCode !== 200) return reject(new Error('http-' + res.statusCode));
                try {
                    const list = JSON.parse(body);
                    if (!Array.isArray(list) || list.length === 0) return reject(new Error('no-releases'));
                    // Pick the most recent non-draft release (prereleases included — this is a beta project)
                    const rel = list.find(r => !r.draft);
                    if (!rel) return reject(new Error('no-releases'));
                    resolve({ tag: rel.tag_name, url: rel.html_url });
                } catch (_e) {
                    reject(new Error('bad-response'));
                }
            });
        });
        req.on('error', () => reject(new Error('offline')));
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function handleCheckUpdate() {
    const now = Date.now();
    if (cached && (now - cached.at) < CACHE_TTL_MS) return cached.result;

    try {
        const { tag, url } = await fetchLatestRelease();
        const result = {
            current: CURRENT_VERSION,
            latest: tag,
            hasUpdate: isNewer(tag, CURRENT_VERSION),
            downloadUrl: url
        };
        cached = { at: now, result };
        return result;
    } catch (err) {
        return { current: CURRENT_VERSION, error: err.message };
    }
}

function setupUpdateHandlers(ipcMain) {
    ipcMain.handle('app:checkUpdate', handleCheckUpdate);
}

module.exports = { setupUpdateHandlers };
