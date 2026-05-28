// Platform-aware paths for Resolve AI.
// Centralizes Windows ↔ macOS path differences and executable resolution.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isMac = process.platform === 'darwin';

// Base application-support directory (APPDATA equivalent on macOS)
const APP_SUPPORT = isMac
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : (process.env.APPDATA || path.join(os.homedir(), '.resolve-ai'));

const RESOLVE_DATA = path.join(APP_SUPPORT, 'Blackmagic Design', 'DaVinci Resolve');

// Rendered .mov output directory
const RENDER_DIR = path.join(RESOLVE_DATA, 'Claude Resolve', 'renders');

// Thumbnail directory (one PNG per render, written by render.js)
const THUMBNAIL_DIR = path.join(RENDER_DIR, 'thumbnails');

// Plugin config directory
const CONFIG_DIR = path.join(RESOLVE_DATA, 'Claude Resolve');

// User-provided images/SVGs copied into local Resolve AI storage.
const ASSET_DIR = path.join(CONFIG_DIR, 'assets');

// Resolve an executable: try a shell lookup first (inherits whatever PATH
// the lookup shell has), then known install locations. Falls back to the
// first candidate. Shared by claude.js and overlay.js.
function findExecutable(candidates, verifyCmd) {
    try {
        const out = execSync(verifyCmd, { encoding: 'utf-8', shell: true, timeout: 5000 }).trim();
        for (const line of out.split(/\r?\n/)) {
            const found = line.trim();
            if (found && fs.existsSync(found)) return found;
        }
    } catch (_e) { /* fall through to candidates */ }
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[0]; // last resort
}

// ── Agent CLIs ───────────────────────────────────────────────────
// DaVinci Resolve is a launchd GUI app: it never inherits the user's
// terminal PATH, so a bare CLI lookup fails on macOS. Resolve an
// absolute path from known locations, plus a login+interactive shell
// (`zsh -lic`) which sources the user's rc files and so sees nvm / fnm /
// Homebrew installs the static list can't enumerate.
const CLAUDE_CANDIDATES = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
    path.join(os.homedir(), '.bun', 'bin', 'claude'),
    'claude'
];
const CLAUDE_VERIFY_CMD = "zsh -lic 'command -v claude' 2>/dev/null";

const CODEX_CANDIDATES = isMac
    ? [
        '/usr/local/bin/codex',
        '/opt/homebrew/bin/codex',
        path.join(os.homedir(), '.codex', 'local', 'codex'),
        path.join(os.homedir(), '.npm-global', 'bin', 'codex'),
        path.join(os.homedir(), '.bun', 'bin', 'codex'),
        'codex'
    ]
    : [
        path.join(process.env.APPDATA || '', 'npm', 'codex.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'codex'),
        'codex.cmd',
        'codex'
    ];
const CODEX_VERIFY_CMD = isMac ? "zsh -lic 'command -v codex' 2>/dev/null" : 'where codex';

// Windows keeps the known npm install path (GUI apps inherit a usable PATH
// and %APPDATA% there). Only macOS needs the resolver.
const CLAUDE_PATH = isMac
    ? findExecutable(CLAUDE_CANDIDATES, CLAUDE_VERIFY_CMD)
    : path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');

function findCodexPath() {
    const found = findExecutable(CODEX_CANDIDATES, CODEX_VERIFY_CMD);
    if (isMac || /\.(cmd|exe)$/i.test(found)) return found;
    for (const ext of ['.cmd', '.exe']) {
        const candidate = found + ext;
        if (fs.existsSync(candidate)) return candidate;
    }
    return found;
}

const CODEX_PATH = findCodexPath();

// Augmented environment for spawning the CLI. On macOS the launchd PATH is
// stripped down to /usr/bin:/bin:/usr/sbin:/sbin — prepend the resolved
// CLI's own bin dir plus the common Homebrew/Node locations so `claude`
// (a `#!/usr/bin/env node` script) and anything it shells out to resolve.
function buildEnv() {
    if (!isMac) return process.env;
    const claudeDir = path.dirname(CLAUDE_PATH);
    const codexDir = path.dirname(CODEX_PATH);
    const prepend = [
        (claudeDir && claudeDir !== '.') ? claudeDir : null,
        (codexDir && codexDir !== '.') ? codexDir : null,
        '/usr/local/bin',
        '/opt/homebrew/bin'
    ].filter(Boolean);
    const merged = [];
    for (const dir of [...prepend, ...(process.env.PATH || '').split(':')]) {
        if (dir && !merged.includes(dir)) merged.push(dir);
    }
    return { ...process.env, PATH: merged.join(':') };
}
const ENV = buildEnv();

// FFmpeg executable candidates
const FFMPEG_CANDIDATES = isMac
    ? [
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        'ffmpeg'
    ]
    : [
        path.join(process.env.PROGRAMFILES || '', 'FFmpeg', 'ffmpeg.exe'),
        path.join(process.env.PROGRAMFILES || '', 'FFmpeg', 'bin', 'ffmpeg.exe'),
        'ffmpeg'
    ];

const FFMPEG_VERIFY_CMD = isMac ? 'which ffmpeg' : 'where ffmpeg';

module.exports = {
    isMac,
    findExecutable,
    CLAUDE_PATH,
    CODEX_PATH,
    ENV,
    RENDER_DIR,
    THUMBNAIL_DIR,
    CONFIG_DIR,
    ASSET_DIR,
    FFMPEG_CANDIDATES,
    FFMPEG_VERIFY_CMD
};
