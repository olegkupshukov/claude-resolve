const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const { handleGetProjectName, handleGetCurrentPage, handleGetCurrentTimeline } = require('./resolve');
const { readConfig } = require('./config');
const { CLAUDE_PATH, isMac } = require('./paths');

const MODEL_IDS = {
    sonnet: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-20250514'
};

let mainWindow = null;
let claudeProcess = null;
let stdoutBuffer = '';
let isContextTurn = false;
let isAborting = false;
let isRestarting = false;

function spawnClaude() {
    if (claudeProcess) return;
    stdoutBuffer = '';

    const config = readConfig();
    const modelId = MODEL_IDS[config.model] || MODEL_IDS.sonnet;

    claudeProcess = spawn(CLAUDE_PATH, [
        '-p',
        '--model', modelId,
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'acceptEdits',
        '--no-session-persistence'
    ], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const proc = claudeProcess;

    proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                handleStreamMessage(msg);
            } catch (_e) {
                mainWindow.webContents.send('claude:stdout', line);
            }
        }
    });

    proc.stderr.on('data', (data) => {
        mainWindow.webContents.send('claude:stderr', data.toString());
    });

    proc.on('close', () => {
        if (claudeProcess === proc) {
            claudeProcess = null;
            stdoutBuffer = '';
        }
        if (isRestarting) {
            isRestarting = false;
            isAborting = false;
            spawnClaude();
            sendContextMessage();
        } else if (isAborting) {
            isAborting = false;
            mainWindow.webContents.send('claude:done', 2);
            spawnClaude();
            sendContextMessage();
        }
    });

    proc.on('error', (err) => {
        mainWindow.webContents.send('claude:stderr', err.message);
        if (claudeProcess === proc) {
            claudeProcess = null;
        }
    });
}

function handleStreamMessage(msg) {
    if (msg.type === 'assistant') {
        if (isContextTurn) return;

        const usage = msg.message?.usage;
        if (usage) {
            mainWindow.webContents.send('claude:status', {
                type: 'tokens',
                input: usage.input_tokens || 0,
                output: usage.output_tokens || 0
            });
        }

        const content = msg.message?.content;
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text) {
                    mainWindow.webContents.send('claude:stdout', block.text);
                } else if (block.type === 'tool_use') {
                    mainWindow.webContents.send('claude:status', {
                        type: 'tool',
                        name: block.name,
                        file: block.input?.file_path || block.input?.path || block.input?.pattern || block.input?.command || null
                    });
                }
            }
        }
    } else if (msg.type === 'result') {
        if (isContextTurn) {
            isContextTurn = false;
            return;
        }
        mainWindow.webContents.send('claude:status', {
            type: 'result',
            cost: msg.total_cost_usd ?? null,
            duration: msg.duration_ms ?? null
        });
        mainWindow.webContents.send('claude:done', msg.is_error ? 1 : 0);
    }
}

const ANIMATION_PRINCIPLES = `## Animation Principles
- Ease-out: cubic-bezier(0.23, 1, 0.32, 1) for entering elements
- Ease-in-out: cubic-bezier(0.77, 0, 0.175, 1) for on-screen movement
- Never scale(0) — start from scale(0.95) + opacity: 0
- Phase durations 150-300ms, stagger 50-100ms between elements
- Animate transform + opacity together. Use translate/scale/rotate, NOT top/left/width/height`;

function buildSystemPrompt(projectName, currentPage, timelineName, config) {
    return `You are Claude Resolve — an AI assistant inside DaVinci Resolve Studio (Workflow Integration Plugin).

Current session: Project: ${projectName || 'Unknown'} | Page: ${currentPage || 'Unknown'} | Timeline: ${timelineName || 'None'}
Target: ${config.width}x${config.height} @ ${config.fps}fps

Keep responses concise — compact plugin window.

## Your Task

You generate Standard HTML Animations — complex one-off motion graphics rendered to ProRes 4444 .mov.

Output ONE \`\`\`html code block with // FILE: Name.html. The HTML must implement:
- window.renderFrame(frameNumber, fps) — set exact visual state for frame
- window.getAnimationDuration() — return total duration in seconds

Full creative freedom: CSS transitions, blur, filters, backdrop-filter, SVG, Canvas — anything. Use transparent background (no body background color). Playwright captures each frame and encodes to ProRes 4444 .mov with alpha, then imports to timeline.

${ANIMATION_PRINCIPLES}`;
}

async function sendContextMessage() {
    const [projectName, currentPage, timelineName] = await Promise.all([
        handleGetProjectName(),
        handleGetCurrentPage(),
        handleGetCurrentTimeline()
    ]);

    const config = readConfig();
    const context = buildSystemPrompt(projectName, currentPage, timelineName, config);

    isContextTurn = true;
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: context } });
    claudeProcess.stdin.write(msg + '\n');
}

function handleClaudeAbort() {
    if (!claudeProcess) return;
    isAborting = true;
    if (process.platform === 'win32') {
        exec(`taskkill /F /T /PID ${claudeProcess.pid}`);
    } else {
        claudeProcess.kill();
    }
}

function handleRestart() {
    if (!claudeProcess) {
        spawnClaude();
        sendContextMessage();
        return;
    }
    isRestarting = true;
    if (process.platform === 'win32') {
        exec(`taskkill /F /T /PID ${claudeProcess.pid}`);
    } else {
        claudeProcess.kill();
    }
}

async function handleClaudeSend(_event, text) {
    if (!claudeProcess) {
        spawnClaude();
        await sendContextMessage();
    }
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
    claudeProcess.stdin.write(msg + '\n');
}

function cleanupClaude() {
    if (claudeProcess) {
        claudeProcess.kill();
        claudeProcess = null;
    }
}

function handleCheckAuth() {
    try {
        execSync(`"${CLAUDE_PATH}" --version`, { encoding: 'utf-8', shell: true, timeout: 10000 });
    } catch {
        return { status: 'not-installed' };
    }
    try {
        execSync(`"${CLAUDE_PATH}" auth status`, { encoding: 'utf-8', shell: true, timeout: 10000 });
        return { status: 'ready' };
    } catch {
        return { status: 'not-logged-in' };
    }
}

function handleOpenLoginTerminal() {
    if (isMac) {
        spawn('osascript', ['-e', `tell application "Terminal" to do script "${CLAUDE_PATH} login"`], {
            detached: true, stdio: 'ignore'
        });
    } else {
        spawn('cmd', ['/c', 'start', 'cmd', '/k', CLAUDE_PATH + ' login'], {
            detached: true, shell: false, stdio: 'ignore'
        });
    }
}

async function handleStart() {
    spawnClaude();
    await sendContextMessage();
}

function setupClaudeHandlers(ipcMain, win) {
    mainWindow = win;
    ipcMain.handle('claude:send', handleClaudeSend);
    ipcMain.handle('claude:abort', handleClaudeAbort);
    ipcMain.handle('claude:restart', handleRestart);
    ipcMain.handle('claude:checkAuth', handleCheckAuth);
    ipcMain.handle('claude:openLoginTerminal', handleOpenLoginTerminal);
    ipcMain.handle('claude:start', handleStart);
}

module.exports = { setupClaudeHandlers, cleanupClaude };
