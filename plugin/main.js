// Claude Resolve — Main Process
// Sandboxed Electron app loaded by DaVinci Resolve as a Workflow Integration Plugin.
// All Resolve API access happens here via WorkflowIntegration.node.
// Renderer communicates through preload.js (contextBridge / ipcMain.handle).

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WorkflowIntegration = require('./WorkflowIntegration.node');

const PLUGIN_ID = 'com.clauderesolve.plugin';
const CLAUDE_PATH = path.join(process.env.APPDATA, 'npm', 'claude.cmd');
const TEMPLATE_DIR = path.join(
    process.env.APPDATA,
    'Blackmagic Design', 'DaVinci Resolve', 'Support',
    'Fusion', 'Templates', 'Edit', 'Titles', 'HTML Titles', 'ClaudeResolve'
);

let mainWindow = null;
let resolveObj = null;
let projectManagerObj = null;
let claudeProcess = null;
let stdoutBuffer = '';
let isContextTurn = false;

async function initResolveInterface() {
    const isSuccess = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!isSuccess) {
        console.error('Failed to initialize Resolve interface');
        return null;
    }

    const resolve = await WorkflowIntegration.GetResolve();
    if (!resolve) {
        console.error('Failed to get Resolve object');
        return null;
    }

    return resolve;
}

async function cleanupResolveInterface() {
    const isSuccess = WorkflowIntegration.CleanUp();
    if (!isSuccess) {
        console.error('Failed to cleanup Resolve interface');
    }
    resolveObj = null;
    projectManagerObj = null;
    return isSuccess;
}

async function getResolve() {
    if (!resolveObj) {
        resolveObj = await initResolveInterface();
    }
    return resolveObj;
}

async function getProjectManager() {
    if (!projectManagerObj) {
        const resolve = await getResolve();
        if (resolve) {
            projectManagerObj = await resolve.GetProjectManager();
        }
    }
    return projectManagerObj;
}

async function getCurrentProject() {
    const pm = await getProjectManager();
    if (!pm) return null;
    return await pm.GetCurrentProject();
}

// IPC handlers — Resolve operations exposed to renderer via preload bridge

async function handleOpenPage(_event, pageName) {
    const resolve = await getResolve();
    if (!resolve) return false;
    if (await resolve.GetCurrentPage() === pageName) return true;
    return await resolve.OpenPage(pageName);
}

async function handleGetCurrentPage() {
    const resolve = await getResolve();
    if (!resolve) return null;
    return await resolve.GetCurrentPage();
}

async function handleGetProjectName() {
    const project = await getCurrentProject();
    if (!project) return null;
    return await project.GetName();
}

async function handleGetCurrentTimeline() {
    const project = await getCurrentProject();
    if (!project) return null;
    const timeline = await project.GetCurrentTimeline();
    if (!timeline) return null;
    return await timeline.GetName();
}

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
    });

    claudeProcess.on('error', (err) => {
        mainWindow.webContents.send('claude:stderr', err.message);
        claudeProcess = null;
    });
}

function handleStreamMessage(msg) {
    if (msg.type === 'assistant') {
        if (isContextTurn) return;
        const content = msg.message?.content;
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text) {
                    mainWindow.webContents.send('claude:stdout', block.text);
                }
            }
        }
    } else if (msg.type === 'result') {
        if (isContextTurn) {
            isContextTurn = false;
            return;
        }
        mainWindow.webContents.send('claude:done', msg.is_error ? 1 : 0);
    }
}

async function sendContextMessage() {
    const [projectName, currentPage, timelineName] = await Promise.all([
        handleGetProjectName(),
        handleGetCurrentPage(),
        handleGetCurrentTimeline()
    ]);

    const context = `You are Claude Resolve — an AI assistant embedded inside DaVinci Resolve Studio as a Workflow Integration Plugin.

Current session:
- Project: ${projectName || 'Unknown'}
- Page: ${currentPage || 'Unknown'}
- Timeline: ${timelineName || 'None'}

Keep responses concise — this is a compact plugin window.

## OGraf Template Generation

When the user asks for overlay graphics, motion graphics, lower thirds, titles, or any visual overlay, generate an OGraf HTML Template — two files:

### File 1: <TemplateName>.ograf.json (manifest)
\`\`\`json
{
  "$schema": "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json",
  "id": "<unique-kebab-case-id>",
  "version": "1.0.0",
  "name": "<Display Name>",
  "description": "<one sentence>",
  "author": { "name": "Claude Resolve" },
  "main": "<TemplateName>.js",
  "duration": <seconds>,
  "stepCount": 1,
  "supportsRealTime": false,
  "supportsNonRealTime": true,
  "schema": {
    "type": "object",
    "properties": { /* max 20 properties */ }
  },
  "renderRequirements": [{ "resolution": { "width": { "ideal": 1920 }, "height": { "ideal": 1080 } }, "frameRate": { "ideal": 30 } }]
}
\`\`\`

Property types for schema:
- String: { "type": "string", "title": "Label", "default": "TEXT" }
- Color: { "type": "string", "title": "Label", "gddType": "color-rrggbb", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#cc0000" }
- Number: { "type": "number", "title": "Label", "minimum": 0, "maximum": 2, "default": 1 }
- Integer: { "type": "integer", "title": "Label", "minimum": 0, "maximum": 999, "default": 0 }
- Boolean: { "type": "boolean", "title": "Label", "default": true }

### File 2: <TemplateName>.js (Web Component)

Structure:
\`\`\`javascript
const DEFAULT_STATE = { /* mirror manifest schema defaults */ };

function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

const STYLE_TEXT = \`
:host { position: absolute; inset: 0; display: block; pointer-events: none; font-family: Arial, sans-serif; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.scene { position: absolute; inset: 0; opacity: 0; will-change: opacity; }
/* Use CSS custom properties for colors: var(--primary-color) */
\`;

class MyGraphic extends HTMLElement {
  constructor() {
    super();
    this._state = { ...DEFAULT_STATE };
    const root = this.attachShadow({ mode: "open" });
    // Create style element, scene div, build all DOM elements
    // Store refs in this._elements = { scene, ... }
  }

  async load(params) { this._state = { ...DEFAULT_STATE, ...(params.data || {}) }; this._applyState(); this._setFrame(0); return { statusCode: 200 }; }
  async dispose() { this._elements.scene.remove(); return { statusCode: 200 }; }
  async playAction() { this._setFrame(0.5); return { statusCode: 200, currentStep: 1 }; }
  async stopAction() { this._setFrame(-1); return { statusCode: 200 }; }
  async updateAction(params) { this._state = { ...this._state, ...(params.data || {}) }; this._applyState(); return { statusCode: 200 }; }
  async customAction() { return { statusCode: 200 }; }
  async goToTime(time) { this._setFrame((time?.timestamp ?? 0) / 1000); return { statusCode: 200 }; }
  async setActionsSchedule() { return { statusCode: 200 }; }

  _applyState() { /* Update text content, set CSS vars: this.style.setProperty("--primary-color", s.primaryColor) */ }

  _setFrame(seconds) {
    // DETERMINISTIC: position ALL elements based on seconds alone
    // Hidden state: if (seconds < 0 || seconds > duration) { scene.opacity = "0"; return; }
    // Use phased animation: each element animates in sequence
    // Phase pattern: easeOutCubic(clamp((seconds - startTime) / phaseDuration, 0, 1))
  }
}

export default MyGraphic;
\`\`\`

### Critical OGraf Rules
- goToTime() receives { timestamp } in MILLISECONDS — divide by 1000 for seconds
- DETERMINISTIC: same timestamp must always produce identical output
- NO timers: no setTimeout, setInterval, requestAnimationFrame
- NO CSS animations with .play() — calculate all positions manually in _setFrame()
- NO external dependencies, no fetch, no CDN
- NO customElements.define() — the host registers the element
- Use Shadow DOM: this.attachShadow({ mode: "open" })
- Export as default: export default ClassName;

### Animation Design Principles
- Use ease-out (cubic-bezier(0.23, 1, 0.32, 1)) for elements entering the screen
- Use ease-in-out (cubic-bezier(0.77, 0, 0.175, 1)) for elements moving on screen
- Never animate from scale(0) — start from scale(0.95) with opacity: 0
- UI animation durations: 150-300ms per phase
- Stagger sequential elements by 50-100ms for cascading reveals
- Use CSS transforms (translate, scale, rotate) — NOT top/left/width/height
- Animate opacity + transform together for natural enter/exit

### Output Format
When generating a template, output EXACTLY two code blocks:
1. First block: \`\`\`json followed by the manifest, with a comment line // FILE: <TemplateName>.ograf.json
2. Second block: \`\`\`javascript followed by the component, with a comment line // FILE: <TemplateName>.js

The user can then install and add to timeline with one click.`;

    isContextTurn = true;
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: context } });
    claudeProcess.stdin.write(msg + '\n');
}

async function handleOverlaySave(_event, { manifestJSON, componentJS, templateName }) {
    const dir = path.join(TEMPLATE_DIR, templateName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, templateName + '.ograf.json'), manifestJSON);
    fs.writeFileSync(path.join(dir, templateName + '.js'), componentJS);
    return dir;
}

async function handleInsertTitle(_event, titleName) {
    const project = await getCurrentProject();
    if (!project) return null;
    const timeline = await project.GetCurrentTimeline();
    if (!timeline) return null;
    return await timeline.InsertTitleIntoTimeline(titleName);
}

async function handleClaudeSend(_event, text) {
    if (!claudeProcess) {
        spawnClaude();
    }
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
    claudeProcess.stdin.write(msg + '\n');
}

function registerIpcHandlers() {
    ipcMain.handle('resolve:openPage', handleOpenPage);
    ipcMain.handle('resolve:getCurrentPage', handleGetCurrentPage);
    ipcMain.handle('resolve:getProjectName', handleGetProjectName);
    ipcMain.handle('resolve:getCurrentTimeline', handleGetCurrentTimeline);
    ipcMain.handle('resolve:cleanup', cleanupResolveInterface);
    ipcMain.handle('claude:send', handleClaudeSend);
    ipcMain.handle('overlay:save', handleOverlaySave);
    ipcMain.handle('resolve:insertTitle', handleInsertTitle);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 700,
        alwaysOnTop: true,
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.on('close', () => {
        if (claudeProcess) {
            claudeProcess.kill();
            claudeProcess = null;
        }
        app.quit();
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
    registerIpcHandlers();
    createWindow();
    spawnClaude();
    await sendContextMessage();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
