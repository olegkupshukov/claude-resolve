const claude = require('./claude');
const codex = require('./codex');
const { readConfig } = require('./config');
const { clearLogs, getLogs, getLogSummary } = require('./agent-logs');
const { buildRepairPrompt, canRepairRender } = require('./repair');

const PROVIDERS = {
    claude: {
        label: 'Claude Code',
        send: claude.handleClaudeSend,
        abort: claude.handleClaudeAbort,
        restart: claude.handleRestart,
        checkAuth: claude.handleCheckAuth,
        openLoginTerminal: claude.handleOpenLoginTerminal,
        start: claude.handleStart,
        cleanup: claude.cleanupClaude
    },
    codex: {
        label: 'Codex CLI',
        send: codex.handleCodexSend,
        abort: codex.handleCodexAbort,
        restart: codex.handleCodexRestart,
        checkAuth: codex.handleCodexCheckAuth,
        openLoginTerminal: codex.handleCodexOpenLoginTerminal,
        start: codex.handleCodexStart,
        cleanup: codex.cleanupCodex
    }
};

let activeProvider = null;

function withProvider(id, status) {
    return { ...status, provider: id, label: PROVIDERS[id].label };
}

function checkProvider(id) {
    return withProvider(id, PROVIDERS[id].checkAuth());
}

function normalizeHealthStatus(status) {
    return {
        ...status,
        installed: status.status !== 'not-installed',
        loggedIn: status.status === 'ready'
    };
}

function handleAgentCheckAuth() {
    const config = readConfig();
    const configured = config.provider || 'auto';

    if (configured !== 'auto') return checkProvider(configured);

    const claudeStatus = checkProvider('claude');
    if (claudeStatus.status === 'ready') return { ...claudeStatus, providerMode: 'auto' };

    const codexStatus = checkProvider('codex');
    if (codexStatus.status === 'ready') return { ...codexStatus, providerMode: 'auto' };

    if (claudeStatus.status !== 'not-installed') return { ...claudeStatus, providerMode: 'auto' };
    return { ...codexStatus, providerMode: 'auto', providers: { claude: claudeStatus, codex: codexStatus } };
}

function handleAgentHealth() {
    const config = readConfig();
    const claudeStatus = normalizeHealthStatus(checkProvider('claude'));
    const codexStatus = normalizeHealthStatus(checkProvider('codex'));
    const active = activeProvider
        || (config.provider && config.provider !== 'auto' ? config.provider : null)
        || (claudeStatus.status === 'ready' ? 'claude' : null)
        || (codexStatus.status === 'ready' ? 'codex' : null)
        || (claudeStatus.installed ? 'claude' : 'codex');

    return {
        configuredProvider: config.provider || 'auto',
        activeProvider: active,
        activeModel: active === 'codex' ? (config.codexModel || 'default') : (config.model || 'sonnet'),
        providers: {
            claude: { ...claudeStatus, model: config.model || 'sonnet' },
            codex: { ...codexStatus, model: config.codexModel || 'default', threadId: codex.getCodexThreadId() }
        },
        logs: getLogSummary()
    };
}

function resolveProvider() {
    const result = handleAgentCheckAuth();
    return result.provider === 'auto' ? 'claude' : result.provider;
}

function selectProvider() {
    const id = resolveProvider();
    if (activeProvider && activeProvider !== id) {
        PROVIDERS[activeProvider].cleanup();
    }
    activeProvider = id;
    return PROVIDERS[id];
}

async function handleAgentSend(event, text) {
    const provider = selectProvider();
    return provider.send(event, text);
}

async function handleAgentRepairRender(event, payload) {
    if (!canRepairRender(payload?.repairCount)) {
        throw new Error('Repair limit reached');
    }
    return handleAgentSend(event, buildRepairPrompt(payload));
}

function handleAgentAbort() {
    const provider = activeProvider ? PROVIDERS[activeProvider] : selectProvider();
    return provider.abort();
}

function handleAgentRestart() {
    if (activeProvider) {
        PROVIDERS[activeProvider].restart();
    }
    activeProvider = null;
}

function handleAgentOpenLoginTerminal() {
    const result = handleAgentCheckAuth();
    return PROVIDERS[result.provider].openLoginTerminal();
}

function handleAgentOpenProviderLogin(_event, providerId) {
    if (!PROVIDERS[providerId]) {
        return { success: false, error: 'Unknown provider' };
    }
    PROVIDERS[providerId].openLoginTerminal();
    return { success: true };
}

async function handleAgentStart(event) {
    const provider = selectProvider();
    return provider.start(event);
}

function cleanupAgent() {
    claude.cleanupClaude();
    codex.cleanupCodex();
    activeProvider = null;
}

function setupAgentHandlers(ipcMain, win) {
    codex.setCodexWindow(win);
    ipcMain.handle('agent:send', handleAgentSend);
    ipcMain.handle('agent:repairRender', handleAgentRepairRender);
    ipcMain.handle('agent:abort', handleAgentAbort);
    ipcMain.handle('agent:restart', handleAgentRestart);
    ipcMain.handle('agent:checkAuth', handleAgentCheckAuth);
    ipcMain.handle('agent:health', handleAgentHealth);
    ipcMain.handle('agent:getLogs', (_event, options) => getLogs(options));
    ipcMain.handle('agent:clearLogs', clearLogs);
    ipcMain.handle('agent:openLoginTerminal', handleAgentOpenLoginTerminal);
    ipcMain.handle('agent:openProviderLoginTerminal', handleAgentOpenProviderLogin);
    ipcMain.handle('agent:start', handleAgentStart);
}

module.exports = { setupAgentHandlers, cleanupAgent, normalizeHealthStatus };
