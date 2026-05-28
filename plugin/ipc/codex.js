const { spawn, exec, execSync } = require('child_process');
const { handleGetProjectName, handleGetCurrentPage, handleGetCurrentTimeline } = require('./resolve');
const { readConfig } = require('./config');
const { CODEX_PATH, ENV, isMac } = require('./paths');
const { buildSystemPrompt } = require('./claude');
const { createCodexJsonlParser } = require('./codex-parser');
const { addLog } = require('./agent-logs');
const { cleanCodexStderr, isNoisyCodexStderr } = require('./codex-stderr-filter');

const MODEL_IDS = {
    default: null,
    'gpt-5.3-codex': 'gpt-5.3-codex',
    'gpt-5.4-mini': 'gpt-5.4-mini',
    'gpt-5.5': 'gpt-5.5'
};

let mainWindow = null;
let codexProcess = null;
let stdoutBuffer = '';
let threadId = null;
let isAborting = false;

function setCodexWindow(win) {
    mainWindow = win;
}

function emit(event, data) {
    if (!mainWindow) return;
    mainWindow.webContents.send(`agent:${event}`, data);
}

function killProcess(proc) {
    if (!proc) return;
    if (process.platform === 'win32') {
        exec(`taskkill /F /T /PID ${proc.pid}`);
    } else {
        proc.kill();
    }
}

function recordStderr(text) {
    for (const line of String(text || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        addLog('codex', 'stderr', trimmed, { hidden: isNoisyCodexStderr(trimmed), level: 'error' });
    }
}

async function buildPrompt(text) {
    const [projectName, currentPage, timelineName] = await Promise.all([
        handleGetProjectName(),
        handleGetCurrentPage(),
        handleGetCurrentTimeline()
    ]);

    const config = readConfig();
    const context = buildSystemPrompt(projectName, currentPage, timelineName, config);
    return `${context}\n\n<user_request>\n${text}\n</user_request>`;
}

function buildCodexArgs({ threadId: currentThreadId, modelId }) {
    const args = currentThreadId
        ? ['exec', 'resume', '--ignore-user-config', '--json', '--skip-git-repo-check']
        : ['exec', '--ignore-user-config', '--json', '--skip-git-repo-check', '--sandbox', 'read-only'];

    if (modelId && !currentThreadId) args.push('--model', modelId);
    if (currentThreadId) args.push(currentThreadId);
    args.push('-');
    return args;
}

function isStaleCodexResumeError(text) {
    const message = String(text || '');
    return /thread\/resume/i.test(message)
        && /no rollout found/i.test(message)
        && /thread id/i.test(message);
}

function spawnCodex(prompt, options = {}) {
    if (codexProcess) {
        emit('stderr', 'Codex is already running.');
        return;
    }

    const config = readConfig();
    const modelId = MODEL_IDS[config.codexModel || 'default'];
    const resumeThreadId = options.forceFresh ? null : threadId;
    const args = buildCodexArgs({ threadId: resumeThreadId, modelId });

    stdoutBuffer = '';
    let stderrBuffer = '';
    let shouldRetryFreshOnClose = false;
    isAborting = false;
    emit('status', { type: 'provider', provider: 'codex', model: config.codexModel || 'default', threadId: resumeThreadId });

    const parser = createCodexJsonlParser({
        stdout: data => {
            addLog('codex', 'stdout', data, { level: 'info' });
            emit('stdout', data);
        },
        stderr: data => {
            if (resumeThreadId && isStaleCodexResumeError(data)) {
                shouldRetryFreshOnClose = true;
                return;
            }
            recordStderr(data);
            const clean = cleanCodexStderr(data);
            if (clean) emit('stderr', clean);
        },
        status: data => {
            if (data.threadId) threadId = data.threadId;
            emit('status', data);
        },
        done: code => emit('done', code)
    }, { threadId: resumeThreadId });

    codexProcess = spawn(CODEX_PATH, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: ENV
    });

    const proc = codexProcess;

    proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();
        for (const line of lines) parser.handleLine(line);
    });

    proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderrBuffer += text;
        recordStderr(text);
    });

    proc.on('close', (code) => {
        if (stdoutBuffer.trim()) parser.handleLine(stdoutBuffer);
        stdoutBuffer = '';
        if (codexProcess === proc) codexProcess = null;
        if (
            resumeThreadId
            && !isAborting
            && (shouldRetryFreshOnClose || (!parser.state.completed && isStaleCodexResumeError(stderrBuffer)))
        ) {
            addLog('codex', 'stderr', `Codex resume thread expired (${resumeThreadId}); retrying fresh turn.`, { level: 'warning' });
            threadId = null;
            emit('status', { type: 'warning', message: 'Codex session expired. Retrying as a fresh turn.' });
            spawnCodex(prompt, { forceFresh: true });
            return;
        }
        if (!parser.state.completed) {
            const clean = cleanCodexStderr(stderrBuffer);
            if (clean) emit('stderr', clean);
            emit('done', isAborting ? 2 : (code === 0 ? 0 : 1));
        }
        isAborting = false;
    });

    proc.on('error', (err) => {
        if (codexProcess === proc) codexProcess = null;
        addLog('codex', 'stderr', err.message, { level: 'error' });
        emit('stderr', err.message);
        emit('done', 1);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
}

async function handleCodexSend(_event, text) {
    const prompt = await buildPrompt(text);
    spawnCodex(prompt);
}

function handleCodexAbort() {
    if (!codexProcess) return;
    isAborting = true;
    killProcess(codexProcess);
}

function handleCodexRestart() {
    threadId = null;
    if (codexProcess) killProcess(codexProcess);
}

function cleanupCodex() {
    if (codexProcess) {
        killProcess(codexProcess);
        codexProcess = null;
    }
    stdoutBuffer = '';
}

function handleCodexCheckAuth() {
    let version = null;
    try {
        version = execSync(`"${CODEX_PATH}" --version`, { encoding: 'utf-8', shell: true, timeout: 10000, env: ENV }).trim();
    } catch {
        return { status: 'not-installed' };
    }
    try {
        execSync(`"${CODEX_PATH}" login status`, { encoding: 'utf-8', shell: true, timeout: 10000, env: ENV });
        return { status: 'ready', version };
    } catch {
        return { status: 'not-logged-in', version };
    }
}

function handleCodexOpenLoginTerminal() {
    const loginCommand = `"${CODEX_PATH}" login`;
    if (isMac) {
        spawn('osascript', ['-e', `tell application "Terminal" to do script "${loginCommand.replace(/"/g, '\\"')}"`], {
            detached: true, stdio: 'ignore'
        });
    } else {
        spawn('cmd', ['/c', 'start', 'cmd', '/k', loginCommand], {
            detached: true, shell: false, stdio: 'ignore'
        });
    }
}

async function handleCodexStart() {
    return handleCodexCheckAuth();
}

function getCodexThreadId() {
    return threadId;
}

module.exports = {
    setCodexWindow,
    handleCodexSend,
    handleCodexAbort,
    handleCodexRestart,
    handleCodexCheckAuth,
    handleCodexOpenLoginTerminal,
    handleCodexStart,
    getCodexThreadId,
    buildCodexArgs,
    isStaleCodexResumeError,
    cleanupCodex
};
