import React, { useEffect, useMemo, useState } from 'react';

const STATUS_LABELS = {
    ready: 'Ready',
    'not-logged-in': 'Login needed',
    'not-installed': 'Not installed',
    checking: 'Checking',
    unknown: 'Unknown'
};

function statusLabel(state) {
    return STATUS_LABELS[state] || String(state || 'unknown').replace(/-/g, ' ');
}

function SettingsHeader({ provider, model, onShowTools, onClose }) {
    return (
        <div className="settings-header">
            <div className="settings-heading">
                <span className="settings-eyebrow">Resolve AI</span>
                <h2>Settings</h2>
                <p>{provider} / {model}</p>
            </div>
            <div className="settings-header-actions">
                <button className="settings-toolbar-btn" onClick={onShowTools}>Tools</button>
                <button className="settings-toolbar-btn icon" onClick={onClose} aria-label="Close settings">×</button>
            </div>
        </div>
    );
}

function SettingsSection({ title, meta, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className={'settings-section ' + (open ? 'is-open' : '')}>
            <button
                type="button"
                className="settings-section-summary"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                <span className="settings-section-title">{title}</span>
                {meta && <em>{meta}</em>}
            </button>
            {open && (
                <div className="settings-section-body">
                    {children}
                </div>
            )}
        </section>
    );
}

function SettingRow({ label, help, value, children }) {
    return (
        <div className="setting-row">
            <div className="setting-label">
                <span>{label}</span>
                {help && <small>{help}</small>}
            </div>
            {value && <div className="setting-value">{value}</div>}
            <div className="setting-control">{children}</div>
        </div>
    );
}

function StatusPill({ state }) {
    const normalized = state || 'unknown';
    return <span className={'status-pill ' + normalized}>{statusLabel(normalized)}</span>;
}

function ProviderHealthCard({ id, label, status, onLogin }) {
    const state = status?.status || 'unknown';
    const loginable = state !== 'ready' && state !== 'not-installed';
    return (
        <div className="provider-health-card">
            <div>
                <strong>{label}</strong>
                <span>{status?.version || 'Version unavailable'}</span>
            </div>
            <StatusPill state={state} />
            {loginable && (
                <button className="settings-small-btn" onClick={() => onLogin(id)}>Login</button>
            )}
        </div>
    );
}

export default function SidebarSettings({ config, onConfigChange, onShowTools, onClose }) {
    const [update, setUpdate] = useState(null);
    const [checking, setChecking] = useState(false);
    const [health, setHealth] = useState(null);
    const [logs, setLogs] = useState([]);
    const [rawOpen, setRawOpen] = useState(!!config.ui?.rawLogsOpen);
    const [brandKit, setBrandKit] = useState(config.brandKit || {});
    const [brandStatus, setBrandStatus] = useState('');
    const [timelineStatus, setTimelineStatus] = useState('');
    const [debugStatus, setDebugStatus] = useState('');

    useEffect(() => {
        runCheck(false);
        refreshHealth();
        const interval = setInterval(refreshHealth, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        setRawOpen(!!config.ui?.rawLogsOpen);
        setBrandKit(config.brandKit || {});
    }, [config.brandKit, config.ui?.rawLogsOpen]);

    async function runCheck(force) {
        if (!window.updatesAPI) {
            setUpdate({ error: 'unavailable' });
            return;
        }
        setChecking(true);
        const minDelay = new Promise(r => setTimeout(r, 400));
        try {
            const [result] = await Promise.all([
                window.updatesAPI.check(force ? { force: true } : undefined),
                minDelay
            ]);
            setUpdate(result);
        } catch {
            setUpdate({ error: 'offline' });
        }
        setChecking(false);
    }

    function renderUpdateLink() {
        if (checking) return <button className="settings-small-btn" disabled>Checking</button>;
        if (update?.error) return <button className="settings-small-btn danger" onClick={() => runCheck(true)}>Retry</button>;
        if (update?.hasUpdate) {
            return (
                <button
                    className="settings-small-btn"
                    onClick={() => window.windowAPI.openExternal(update.downloadUrl)}
                >
                    Update v{String(update.latest).replace(/^v/, '')}
                </button>
            );
        }
        return <button className="settings-small-btn" onClick={() => runCheck(true)}>{update ? 'Up to date' : 'Check'}</button>;
    }

    async function refreshHealth() {
        if (!window.agentAPI?.health) return;
        try {
            const nextHealth = await window.agentAPI.health();
            const nextLogs = await window.agentAPI.getLogs({ includeHidden: true });
            setHealth(nextHealth);
            setLogs(nextLogs);
        } catch {
            setHealth(null);
        }
    }

    async function handleClearLogs() {
        await window.agentAPI.clearLogs();
        await refreshHealth();
    }

    async function handleDebugBundle() {
        setDebugStatus('Creating');
        try {
            const result = await window.debugAPI?.createBundle?.();
            setDebugStatus(result?.success ? 'Bundle ready' : 'Failed');
        } catch {
            setDebugStatus('Failed');
        }
        setTimeout(() => setDebugStatus(''), 2600);
    }

    async function handleRawToggle() {
        const next = !rawOpen;
        setRawOpen(next);
        await onConfigChange({ ui: { ...(config.ui || {}), rawLogsOpen: next } });
    }

    async function handleSaveBrand() {
        setBrandStatus('Saving');
        await onConfigChange({ brandKit });
        setBrandStatus('Saved');
        setTimeout(() => setBrandStatus(''), 1600);
    }

    async function handleUseTimelineSettings() {
        setTimelineStatus('Checking');
        try {
            const timeline = await window.resolveAPI.getTimelineSettings();
            const patch = {};
            if (timeline?.fps) patch.fps = timeline.fps;
            if (timeline?.width && timeline?.height) {
                patch.width = timeline.width;
                patch.height = timeline.height;
            }
            if (Object.keys(patch).length === 0) {
                setTimelineStatus('Unavailable');
            } else {
                await onConfigChange(patch);
                setTimelineStatus(timeline?.name ? `Using ${timeline.name}` : 'Synced');
            }
        } catch {
            setTimelineStatus('Unavailable');
        }
        setTimeout(() => setTimelineStatus(''), 2400);
    }

    const provider = config.provider || 'auto';
    const modelValue = provider === 'codex' ? (config.codexModel || 'default') : (config.model || 'sonnet');
    const activeProvider = health?.activeProvider || provider;
    const activeModel = health?.activeModel || modelValue;
    const versionText = update?.current ? `v${update.current}` : 'Resolve AI';
    const timelineText = timelineStatus || `${config.width}×${config.height} / ${config.fps}fps`;
    const activeProviderStatus = health?.providers?.[activeProvider]?.status || health?.providers?.[provider]?.status || 'unknown';
    const brandFilledCount = useMemo(() => {
        return ['colors', 'fonts', 'tone', 'logoPath', 'phrases'].filter(key => String(brandKit[key] || '').trim()).length;
    }, [brandKit]);

    return (
        <div className="settings settings-full">
            <SettingsHeader
                provider={activeProvider}
                model={activeModel}
                onShowTools={onShowTools}
                onClose={onClose}
            />

            <div className="settings-scroll">
                <SettingsSection title="Provider" meta={statusLabel(activeProviderStatus)}>
                    <div className="settings-summary-strip">
                        <span>Active</span>
                        <strong>{activeProvider} / {activeModel}</strong>
                        <StatusPill state={activeProviderStatus} />
                    </div>

                    <SettingRow label="Provider" help="Choose which local AI CLI handles prompts.">
                        <select
                            className="select"
                            value={provider}
                            onChange={e => onConfigChange({ provider: e.target.value })}
                        >
                            <option value="auto">Auto · first ready</option>
                            <option value="claude">Claude Code</option>
                            <option value="codex">Codex CLI</option>
                        </select>
                    </SettingRow>

                    <SettingRow label="Model" help={provider === 'codex' ? 'Codex CLI model preference.' : 'Claude Code model preference.'}>
                        <select
                            className="select"
                            value={modelValue}
                            onChange={e => {
                                if (provider === 'codex') onConfigChange({ codexModel: e.target.value });
                                else onConfigChange({ model: e.target.value });
                            }}
                        >
                            {provider === 'codex' ? (
                                <>
                                    <option value="default">Codex default</option>
                                    <option value="gpt-5.3-codex">GPT-5.3 Codex</option>
                                    <option value="gpt-5.4-mini">GPT-5.4 Mini</option>
                                    <option value="gpt-5.5">GPT-5.5</option>
                                </>
                            ) : (
                                <>
                                    <option value="sonnet">Sonnet · fast</option>
                                    <option value="opus">Opus · smart</option>
                                </>
                            )}
                        </select>
                    </SettingRow>

                </SettingsSection>

                <SettingsSection title="Timeline" meta={timelineText}>
                    <SettingRow label="FPS" help="Used for prompt context and ProRes rendering.">
                        <select
                            className="select"
                            value={config.fps}
                            onChange={e => onConfigChange({ fps: Number(e.target.value) })}
                        >
                            <option value={24}>24</option>
                            <option value={25}>25</option>
                            <option value={30}>30</option>
                            <option value={60}>60</option>
                        </select>
                    </SettingRow>

                    <SettingRow label="Size" help="Canvas size for generated overlays.">
                        <select
                            className="select"
                            value={`${config.width}x${config.height}`}
                            onChange={e => {
                                const [w, h] = e.target.value.split('x').map(Number);
                                onConfigChange({ width: w, height: h });
                            }}
                        >
                            <option value="1920x1080">1920 × 1080</option>
                            <option value="3840x2160">3840 × 2160</option>
                            <option value="1080x1920">1080 × 1920 vertical</option>
                            <option value="1080x1350">1080 × 1350</option>
                            <option value="1080x1080">1080 × 1080</option>
                        </select>
                    </SettingRow>

                    <button className="settings-wide-action" onClick={handleUseTimelineSettings}>
                        Use current timeline settings
                    </button>
                </SettingsSection>

                <SettingsSection title="Brand Kit" meta={`${brandFilledCount}/5 fields`} defaultOpen={false}>
                    <SettingRow label="Colors" help="Comma-separated brand colors.">
                        <input
                            className="text-field"
                            value={brandKit.colors || ''}
                            onChange={e => setBrandKit(prev => ({ ...prev, colors: e.target.value }))}
                            placeholder="#111111, white, amber"
                        />
                    </SettingRow>
                    <SettingRow label="Fonts" help="Preferred typefaces or style notes.">
                        <input
                            className="text-field"
                            value={brandKit.fonts || ''}
                            onChange={e => setBrandKit(prev => ({ ...prev, fonts: e.target.value }))}
                            placeholder="Fraunces, JetBrains Mono"
                        />
                    </SettingRow>
                    <SettingRow label="Tone" help="Visual personality for new generations.">
                        <input
                            className="text-field"
                            value={brandKit.tone || ''}
                            onChange={e => setBrandKit(prev => ({ ...prev, tone: e.target.value }))}
                            placeholder="clean, cinematic, precise"
                        />
                    </SettingRow>
                    <SettingRow label="Logo" help="Optional local logo path.">
                        <input
                            className="text-field"
                            value={brandKit.logoPath || ''}
                            onChange={e => setBrandKit(prev => ({ ...prev, logoPath: e.target.value }))}
                            placeholder="C:\\path\\logo.png"
                        />
                    </SettingRow>
                    <SettingRow label="Phrases" help="Words or phrases the assistant may reuse.">
                        <textarea
                            className="text-field textarea"
                            value={brandKit.phrases || ''}
                            onChange={e => setBrandKit(prev => ({ ...prev, phrases: e.target.value }))}
                            placeholder="Common phrases"
                            rows={3}
                        />
                    </SettingRow>
                    <button className="settings-wide-action primary" onClick={handleSaveBrand}>
                        {brandStatus || 'Save brand kit'}
                    </button>
                </SettingsSection>

                <SettingsSection title="Diagnostics" meta={logs.length ? `${logs.length} logs` : 'Quiet'} defaultOpen={false}>
                    <div className="provider-health-grid">
                        <ProviderHealthCard
                            id="claude"
                            label="Claude"
                            status={health?.providers?.claude}
                            onLogin={id => window.agentAPI.openProviderLoginTerminal(id)}
                        />
                        <ProviderHealthCard
                            id="codex"
                            label="Codex"
                            status={health?.providers?.codex}
                            onLogin={id => window.agentAPI.openProviderLoginTerminal(id)}
                        />
                    </div>
                    {health?.logs?.lastFailure && (
                        <div className="last-failure">{health.logs.lastFailure.message}</div>
                    )}
                    <div className="diagnostic-actions">
                        <button className="settings-small-btn" onClick={refreshHealth}>Refresh health</button>
                        <button className="settings-small-btn" onClick={handleRawToggle}>
                            {rawOpen ? 'Hide raw logs' : 'Show raw logs'}
                        </button>
                        <button className="settings-small-btn" onClick={handleDebugBundle}>
                            {debugStatus || 'Copy debug bundle'}
                        </button>
                        {logs.length > 0 && <button className="settings-small-btn danger" onClick={handleClearLogs}>Clear logs</button>}
                    </div>
                    {rawOpen && (
                        <div className="raw-logs" tabIndex={0}>
                            {logs.length === 0 ? (
                                <div className="raw-empty">No logs captured</div>
                            ) : logs.slice(-80).map(log => (
                                <div className={'raw-line ' + (log.hidden ? 'muted' : log.level)} key={log.id}>
                                    <span>{log.provider}/{log.stream}</span>
                                    <code>{log.message}</code>
                                </div>
                            ))}
                        </div>
                    )}
                </SettingsSection>

                <SettingsSection title="App" meta={versionText} defaultOpen={false}>
                    <div className="settings-app-row">
                        <div>
                            <strong>Resolve AI</strong>
                            <span>{versionText}</span>
                        </div>
                        {renderUpdateLink()}
                    </div>
                </SettingsSection>
            </div>
        </div>
    );
}
