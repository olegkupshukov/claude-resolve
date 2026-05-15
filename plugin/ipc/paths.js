// Platform-aware paths for Claude Resolve plugin.
// Centralizes all Windows ↔ macOS path differences.

const os = require('os');
const path = require('path');

const isMac = process.platform === 'darwin';

// Base application-support directory (APPDATA equivalent on macOS)
const APP_SUPPORT = isMac
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.env.APPDATA;

const RESOLVE_DATA = path.join(APP_SUPPORT, 'Blackmagic Design', 'DaVinci Resolve');

// Claude CLI
const CLAUDE_PATH = isMac
    ? 'claude'
    : path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');

// Rendered .mov output directory
const RENDER_DIR = path.join(RESOLVE_DATA, 'Claude Resolve', 'renders');

// Plugin config directory
const CONFIG_DIR = path.join(RESOLVE_DATA, 'Claude Resolve');

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

const PYTHON_VERIFY_CMD = isMac
    ? 'python3 -c "import sys; print(sys.executable)"'
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
    CLAUDE_PATH,
    RENDER_DIR,
    CONFIG_DIR,
    PYTHON_CANDIDATES,
    PYTHON_VERIFY_CMD,
    FFMPEG_CANDIDATES,
    FFMPEG_VERIFY_CMD
};
