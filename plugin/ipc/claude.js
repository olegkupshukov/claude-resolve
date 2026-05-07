const { spawn, exec } = require('child_process');
const path = require('path');
const { handleGetProjectName, handleGetCurrentPage, handleGetCurrentTimeline } = require('./resolve');

const CLAUDE_PATH = path.join(process.env.APPDATA, 'npm', 'claude.cmd');

let mainWindow = null;
let claudeProcess = null;
let stdoutBuffer = '';
let isContextTurn = false;
let isAborting = false;

function spawnClaude() {
    stdoutBuffer = '';

    claudeProcess = spawn(CLAUDE_PATH, [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'acceptEdits',
        '--no-session-persistence'
    ], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    claudeProcess.stdout.on('data', (chunk) => {
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

    claudeProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('claude:stderr', data.toString());
    });

    claudeProcess.on('close', () => {
        claudeProcess = null;
        stdoutBuffer = '';
        if (isAborting) {
            isAborting = false;
            mainWindow.webContents.send('claude:done', 2);
            spawnClaude();
            sendContextMessage();
        }
    });

    claudeProcess.on('error', (err) => {
        mainWindow.webContents.send('claude:stderr', err.message);
        claudeProcess = null;
    });
}

function handleStreamMessage(msg) {
    // DEBUG: log all stream-json events (remove after investigation)
    console.log('STREAM:', msg.type, JSON.stringify(msg).slice(0, 300));

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

async function sendContextMessage() {
    const [projectName, currentPage, timelineName] = await Promise.all([
        handleGetProjectName(),
        handleGetCurrentPage(),
        handleGetCurrentTimeline()
    ]);

    const context = `You are Claude Resolve — an AI assistant inside DaVinci Resolve Studio (Workflow Integration Plugin).

Current session: Project: ${projectName || 'Unknown'} | Page: ${currentPage || 'Unknown'} | Timeline: ${timelineName || 'None'}

Keep responses concise — compact plugin window.

## Two Overlay Types

### 1. OGraf Template (reusable overlays with Inspector params)

For reusable overlays/lower thirds/titles. Output EXACTLY two code blocks: \`\`\`json with // FILE: Name.ograf.json, then \`\`\`javascript with // FILE: Name.js.

Web Component must implement: load, dispose, playAction, stopAction, updateAction, customAction, goToTime, setActionsSchedule, connectedCallback. Use Shadow DOM, export default, NO customElements.define().

Schema property types: string, string with gddType "color-rrggbb", number (min/max), integer (min/max), boolean. Max 20 properties.

Critical: goToTime receives {timestamp: ms} — use _setFrame(timestamp/1000). DETERMINISTIC: same timestamp = identical output. NO setTimeout/setInterval/rAF. NO CSS transitions/animations — direct style assignments only. will-change on animated elements. .toFixed(1) for sub-pixel values.

For full OGraf spec: C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\OGraf HTML Templates\\

### 2. Standard HTML Animation (complex one-off motion graphics)

For complex animations with full CSS/JS freedom. Output ONE \`\`\`html code block with // FILE: Name.html. The HTML must implement:
- window.renderFrame(frameNumber, fps) — set exact visual state for frame
- window.getAnimationDuration() — return total duration in seconds

Full creative freedom: CSS transitions, blur, filters, backdrop-filter, SVG, Canvas — anything. Use transparent background (no body background color). Playwright captures each frame and encodes to ProRes 4444 .mov with alpha, then imports to timeline.

### Which to use
- User wants reusable template with Inspector params → OGraf
- User wants complex one-off animation, cinematic motion graphics, effects with blur/filters → Standard HTML

### Animation Principles (both types)
- Ease-out: cubic-bezier(0.23, 1, 0.32, 1) for entering elements
- Ease-in-out: cubic-bezier(0.77, 0, 0.175, 1) for on-screen movement
- Never scale(0) — start from scale(0.95) + opacity: 0
- Phase durations 150-300ms, stagger 50-100ms between elements
- Animate transform + opacity together. Use translate/scale/rotate, NOT top/left/width/height`;

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

async function handleClaudeSend(_event, text) {
    if (!claudeProcess) {
        spawnClaude();
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

function setupClaudeHandlers(ipcMain, win) {
    mainWindow = win;
    ipcMain.handle('claude:send', handleClaudeSend);
    ipcMain.handle('claude:abort', handleClaudeAbort);
}

module.exports = { setupClaudeHandlers, spawnClaude, sendContextMessage, cleanupClaude };
