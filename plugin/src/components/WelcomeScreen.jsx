import React from 'react';
import { Github, Insta } from './Icons';

const CHIPS = [
    { ico: 'G', title: 'Create a glitch title animation', hint: '/title --style=glitch' },
    { ico: 'L', title: 'Animate a lower third in teal', hint: '/lower-third --transparent' },
    { ico: 'T', title: 'Generate a film-burn transition', hint: '/transition --type=burn' }
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
            <div className="welcome">
                <div className="w-logo" />
                <p className="w-sub">Checking Claude Code…</p>
            </div>
        );
    }

    if (authState === 'not-installed') {
        return (
            <div className="welcome">
                <div className="w-logo" />
                <h2 className="w-title">Claude Code not found</h2>
                <p className="w-sub">Install it, then check again:</p>
                <code className="w-code">npm install -g @anthropic-ai/claude-code</code>
                <button className="btn-line" onClick={handleCheckAgain}>Check Again</button>
            </div>
        );
    }

    if (authState === 'not-logged-in') {
        return (
            <div className="welcome">
                <div className="w-logo" />
                <h2 className="w-title">Claude Code found</h2>
                <p className="w-sub">Log in from the terminal, then check again.</p>
                <button className="btn-line primary" onClick={() => window.claudeAPI.openLoginTerminal()}>
                    Open Login in Terminal
                </button>
                <button className="btn-line" onClick={handleCheckAgain}>Check Again</button>
            </div>
        );
    }

    return (
        <div className="welcome">
            <div className="w-logo" />
            <h1 className="w-title stagger">Claude Resolve</h1>
            <p className="w-sub stagger">AI Motion Graphics for DaVinci Resolve</p>
            <p className="w-author stagger">by <b>Oleg Kupshukov</b></p>

            <div className="chips">
                {CHIPS.map((c, i) => (
                    <button className="chip stagger" key={i} onClick={() => onPrompt(c.title)}>
                        <span className="chip-ico">{c.ico}</span>
                        <span className="chip-lbl">
                            <span className="chip-t">{c.title}</span>
                            <span className="chip-h">{c.hint}</span>
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
