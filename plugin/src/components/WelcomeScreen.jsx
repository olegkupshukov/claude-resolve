import React, { useState } from 'react';

export default function WelcomeScreen({ authState, onAuthStateChange, onStart, onPrompt }) {
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

    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <h1 className="welcome-title">Claude Resolve</h1>
                <p className="welcome-subtitle">AI Motion Graphics for DaVinci Resolve</p>
                <hr className="welcome-separator" />
                <div className="welcome-chips">
                    <button className="welcome-chip" onClick={() => onPrompt('Generate a lower third overlay')}>
                        Generate a lower third overlay
                    </button>
                    <button className="welcome-chip" onClick={() => onPrompt('Create a glitch title animation')}>
                        Create a glitch title animation
                    </button>
                    <button className="welcome-chip" onClick={() => onPrompt('Make a cinematic text reveal')}>
                        Make a cinematic text reveal
                    </button>
                </div>
            </div>
        </div>
    );
}
