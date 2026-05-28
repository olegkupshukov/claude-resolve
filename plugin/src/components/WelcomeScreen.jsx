import React from 'react';
import { Github, Insta } from './Icons';
import { PROMPT_PRESETS } from '../data/promptPresets';

const CHIPS = PROMPT_PRESETS.slice(0, 3).map((preset, index) => ({
    ico: ['T', 'L', 'C'][index],
    title: preset.prompt,
    label: preset.label
}));

const INSTALL_COMMANDS = {
    claude: 'npm install -g @anthropic-ai/claude-code',
    codex: 'npm install -g @openai/codex',
    auto: 'npm install -g @openai/codex'
};

function providerCopy(authInfo, config) {
    const provider = authInfo?.provider || config?.provider || 'auto';
    if (provider === 'codex') {
        return { provider, label: 'Codex CLI', install: INSTALL_COMMANDS.codex };
    }
    if (provider === 'claude') {
        return { provider, label: 'Claude Code', install: INSTALL_COMMANDS.claude };
    }
    return { provider, label: 'AI provider', install: INSTALL_COMMANDS.auto };
}

export default function WelcomeScreen({ authInfo, config, onAuthStateChange, onStart, onPrompt, onDismiss }) {
    const authState = authInfo?.status || 'checking';
    const copy = providerCopy(authInfo, config);

    async function handleCheckAgain() {
        onAuthStateChange({ ...authInfo, status: 'checking' });
        const result = await (window.agentAPI || window.claudeAPI).checkAuth();
        onAuthStateChange(result);
        if (result.status === 'ready') {
            await onStart();
        }
    }

    if (authState === 'checking') {
        return (
            <div className="welcome">
                <div className="w-logo" />
                <p className="w-sub">Checking {copy.label}…</p>
            </div>
        );
    }

    if (authState === 'not-installed') {
        return (
            <div className="welcome">
                <div className="w-logo" />
                <h2 className="w-title">{copy.label} not found</h2>
                <p className="w-sub">Install it, then check again:</p>
                <code className="w-code">{copy.install}</code>
                <button className="btn-line" onClick={handleCheckAgain}>Check Again</button>
            </div>
        );
    }

    if (authState === 'not-logged-in') {
        return (
            <div className="welcome">
                <div className="w-logo" />
                <h2 className="w-title">{copy.label} found</h2>
                <p className="w-sub">Log in from the terminal, then check again.</p>
                <button className="btn-line primary" onClick={() => (window.agentAPI || window.claudeAPI).openLoginTerminal()}>
                    Open Login in Terminal
                </button>
                <button className="btn-line" onClick={handleCheckAgain}>Check Again</button>
            </div>
        );
    }

    return (
        <div className="welcome">
            <div className="w-logo" />
            <h1 className="w-title stagger">Resolve AI</h1>
            <p className="w-sub stagger">AI Motion Graphics for DaVinci Resolve</p>
            <p className="w-author stagger">by <b>Oleg Kupshukov</b></p>

            <div className="chips">
                {CHIPS.map((c, i) => (
                    <button className="chip stagger" key={i} onClick={() => onPrompt(c.title)}>
                        <span className="chip-ico">{c.ico}</span>
                        <span className="chip-lbl">
                            <span className="chip-t">{c.label}</span>
                            <span className="chip-h">{c.title}</span>
                        </span>
                        <span className="chip-arrow">›</span>
                    </button>
                ))}
            </div>

            <button className="w-blank stagger" onClick={onDismiss}>
                Start with a blank prompt
            </button>

            <div className="w-footer stagger">
                <button onClick={() => window.windowAPI.openExternal('https://github.com/olegkupshukov/claude-resolve')}>
                    <Github /> GitHub
                </button>
                <span className="divider" />
                <button onClick={() => window.windowAPI.openExternal('https://instagram.com/olegkupshukov')}>
                    <Insta /> @olegkupshukov
                </button>
            </div>
        </div>
    );
}
