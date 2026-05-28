import React, { useRef, useEffect, useState } from 'react';
import { Gear, Send, Stop, Tools } from './Icons';

export default function ChatInput({ onSend, onStop, draftPrompt, isProcessing, sidebarOpen, sidebarView, onToggleSidebar, onToggleTools, updateAvailable }) {
    const inputRef = useRef(null);
    const [value, setValue] = useState('');

    useEffect(() => {
        if (!isProcessing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isProcessing]);

    useEffect(() => {
        if (!draftPrompt?.text || isProcessing) return;
        setValue(draftPrompt.text);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(draftPrompt.text.length, draftPrompt.text.length);
        });
    }, [draftPrompt?.revision, draftPrompt?.text, isProcessing]);

    useEffect(() => {
        if (!inputRef.current) return;
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 92)}px`;
    }, [value]);

    function handleSend() {
        const text = value.trim();
        if (!text || isProcessing) return;
        setValue('');
        onSend(text);
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    const settingsOpen = sidebarOpen && sidebarView === 'settings';
    const toolsOpen = sidebarOpen && sidebarView === 'tools';
    const gearLabel = settingsOpen ? 'Close settings' : 'Open settings';
    const toolsLabel = toolsOpen ? 'Close tools' : 'Open create tools';

    return (
        <div className="composer">
            <button
                className={'composer-tools' + (toolsOpen ? ' on' : '')}
                onClick={onToggleTools}
                aria-label={toolsLabel}
                aria-pressed={toolsOpen}
                title={toolsLabel}
            >
                <Tools />
            </button>

            <button
                className={'composer-gear' + (settingsOpen ? ' on' : '')}
                onClick={onToggleSidebar}
                aria-label={gearLabel}
                aria-pressed={settingsOpen}
                title={gearLabel}
            >
                <Gear />
                {updateAvailable && <span className="gear-badge" />}
            </button>

            <div className="input-wrap">
                <textarea
                    ref={inputRef}
                    className="composer-input"
                    placeholder="Ask Resolve AI to animate..."
                    aria-label="Prompt"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    rows={1}
                    autoFocus
                    disabled={isProcessing}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {isProcessing ? (
                <button className="send stop" onClick={onStop} aria-label="Stop">
                    <Stop />
                </button>
            ) : (
                <button className="send" onClick={handleSend} aria-label="Send">
                    <Send />
                </button>
            )}
        </div>
    );
}
