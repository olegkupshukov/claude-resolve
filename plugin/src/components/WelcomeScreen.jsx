import React from 'react';

const CHIPS = [
    'Create a glitch title animation',
    'Make a cinematic text reveal',
    'Generate a subscribe button animation'
];

export default function WelcomeScreen({ authState, onAuthStateChange, onStart, onPrompt, onDismiss }) {
    async function handleCheckAgain() {
        onAuthStateChange('checking');
        const result = await window.claudeAPI.checkAuth();
        onAuthStateChange(result.status);
        if (result.status === 'ready') {
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
                    <p className="welcome-subtitle">Log in from the terminal, then click Check Again.</p>
                    <button className="btn" onClick={() => window.claudeAPI.openLoginTerminal()}>
                        Open Login in Terminal
                    </button>
                    <button className="btn btn-secondary" style={{ marginTop: 'var(--gap-sm)' }} onClick={handleCheckAgain}>
                        Check Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <h1 className="welcome-title">Claude Resolve</h1>
                <p className="welcome-subtitle">AI Motion Graphics for DaVinci Resolve</p>
                <p className="welcome-author">by Oleg Kupshukov</p>
                <div className="welcome-chips">
                    {CHIPS.map(text => (
                        <button key={text} className="welcome-chip" onClick={() => onPrompt(text)}>
                            {text}
                        </button>
                    ))}
                </div>
                <button className="welcome-blank-link" onClick={onDismiss}>
                    Start with a blank prompt
                </button>
                <div className="welcome-footer-links">
                    <button className="welcome-ext-link" onClick={() => window.windowAPI.openExternal('https://github.com/olegkupshukov/claude-resolve')}>GitHub</button>
                    <button className="welcome-ext-link" onClick={() => window.windowAPI.openExternal('https://instagram.com/olegkupshukov')}>Instagram</button>
                </div>
            </div>
        </div>
    );
}
