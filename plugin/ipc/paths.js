// Platform-aware paths for Claude Resolve plugin.
// Centralizes Windows ↔ macOS path differences and executable resolution.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isMac = process.platform === 'darwin';

// Base application-support directory (APPDATA equivalent on macOS)
const APP_SUPPORT = isMac
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.env.APPDATA;

const RESOLVE_DATA = path.join(APP_SUPPORT, 'Blackmagic Design', 'DaVinci Resolve');

// Rendered .mov output directory
const RENDER_DIR = path.join(RESOLVE_DATA, 'Claude Resolve', 'renders');

// Thumbnail directory (one PNG per render, written by render.py)
const THUMBNAIL_DIR = path.join(RENDER_DIR, 'thumbnails');

// Plugin config directory
const CONFIG_DIR = path.join(RESOLVE_DATA, 'Claude Resolve');

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

// ── Claude Code CLI ──────────────────────────────────────────────
// DaVinci Resolve is a launchd GUI app: it never inherits the user's
// terminal PATH, so a bare `claude` lookup fails on macOS. Resolve an
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

// Windows keeps the known npm install path (GUI apps inherit a usable PATH
// and %APPDATA% there). Only macOS needs the resolver.
const CLAUDE_PATH = isMac
    ? findExecutable(CLAUDE_CANDIDATES, CLAUDE_VERIFY_CMD)
    : path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');

// Augmented environment for spawning the CLI. On macOS the launchd PATH is
// stripped down to /usr/bin:/bin:/usr/sbin:/sbin — prepend the resolved
// CLI's own bin dir plus the common Homebrew/Node locations so `claude`
// (a `#!/usr/bin/env node` script) and anything it shells out to resolve.
function buildEnv() {
    if (!isMac) return process.env;
    const claudeDir = path.dirname(CLAUDE_PATH);
    const prepend = [
        (claudeDir && claudeDir !== '.') ? claudeDir : null,
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

// Python executable candidates
const PYTHON_CANDIDATES = isMac
    ? [
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python3',
        'python3'
    ]
    : [
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
        'python'
    ];

// macOS: probe via a login+interactive shell so the lookup sees the
// user's real PATH (/usr/local/bin, /opt/homebrew/bin) and resolves the
// python3 that actually has Playwright — not the bare /usr/bin/python3
// that a stripped-PATH /bin/sh probe would find first.
const PYTHON_VERIFY_CMD = isMac
    ? "zsh -lic 'command -v python3' 2>/dev/null"
    : 'python -c "import sys; print(sys.executable)"';

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
    ENV,
    RENDER_DIR,
    THUMBNAIL_DIR,
    CONFIG_DIR,
    PYTHON_CANDIDATES,
    PYTHON_VERIFY_CMD,
    FFMPEG_CANDIDATES,
    FFMPEG_VERIFY_CMD
};
