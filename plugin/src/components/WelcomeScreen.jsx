import React, { useState } from 'react';

const MOV_CHIPS = [
    'Create a glitch title animation',
    'Make a cinematic text reveal',
    'Generate a subscribe button animation'
];
const OGRAF_CHIPS = [
    'Generate a lower third overlay',
    'Create a title card template',
    'Make a countdown timer'
];

export default function WelcomeScreen({ authState, onAuthStateChange, onStart, onPrompt, onDismiss, mode, onModeSwitch }) {
    const [loginPending, setLoginPending] = useState(false);

    async function handleCheckAgain() {
        onAuthStateChange('checking');
        const result = await window.claudeAPI.checkAuth();
        onAuthStateChange(result.status);
        if (result.status === 'ready') {
            await onStart();
        }
    }

    async function handleLogin() {
        setLoginPending(true);
        const result = await window.claudeAPI.login();
        setLoginPending(false);
        if (result.success) {
            await onStart();
        }
    }

    if (authState === 'checking') {
        return (
            <div className="welcome-screen">
                <div className="welcome-content">
                    <p className="welcome-subtitle">Checking Claude Code...</p>
                </div>
            </div>
        );
    }

    if (authState === 'not-installed') {
        return (
            <div className="welcome-screen">
                <div className="welcome-content">
                    <h2 className="welcome-title">Claude Code not found</h2>
                    <p className="welcome-subtitle">Install it with:</p>
                    <code className="welcome-code">npm install -g @anthropic-ai/claude-code</code>
                    <button className="btn btn-secondary" onClick={handleCheckAgain}>Check Again</button>
                </div>
            </div>
        );
    }

    if (authState === 'not-logged-in') {
        return (
            <div className="welcome-screen">
                <div className="welcome-content">
                    <h2 className="welcome-title">Claude Code found</h2>
                    <p className="welcome-subtitle">Login to continue</p>
                    <button className="btn" onClick={handleLogin} disabled={loginPending}>
                        {loginPending ? 'Waiting for browser...' : 'Login with Claude'}
                    </button>
                </div>
            </div>
        );
    }

    const chips = mode === 'ograf' ? OGRAF_CHIPS : MOV_CHIPS;

    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <h1 className="welcome-title">Claude Resolve</h1>
                <p className="welcome-subtitle">AI Motion Graphics for DaVinci Resolve</p>
                <div className="mode-cards">
                    <button
                        className={`mode-card${mode === 'mov' ? ' mode-card-active' : ''}`}
                        onClick={() => onModeSwitch('mov')}
                    >
                        <span className="mode-card-icon">&#127916;</span>
                        <span className="mode-card-title">Animation (.mov)</span>
                        <span className="mode-card-subtitle">Complex motion graphics, full CSS/JS freedom</span>
                    </button>
                    <button
                        className={`mode-card${mode === 'ograf' ? ' mode-card-active' : ''}`}
                        onClick={() => onModeSwitch('ograf')}
                    >
                        <span className="mode-card-icon">&#128208;</span>
                        <span className="mode-card-title">Template (OGraf)</span>
                        <span className="mode-card-subtitle">Reusable overlays with Inspector params</span>
                    </button>
                </div>
                <hr className="welcome-separator" />
                <div className="welcome-chips">
                    {chips.map(text => (
                        <button key={text} className="welcome-chip" onClick={() => onPrompt(text)}>
                            {text}
                        </button>
                    ))}
                </div>
                <button className="welcome-blank-link" onClick={onDismiss}>
                    Start with a blank prompt
                </button>
            </div>
        </div>
    );
}
