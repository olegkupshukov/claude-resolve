import React, { useRef, useEffect } from 'react';

export default function ChatInput({ onSend, onStop, isProcessing, sidebarOpen, onToggleSidebar }) {
    const inputRef = useRef(null);

    useEffect(() => {
        if (!isProcessing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isProcessing]);

    function handleSend() {
        const text = inputRef.current.value.trim();
        if (!text || isProcessing) return;
        inputRef.current.value = '';
        onSend(text);
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    }

    return (
        <div id="input-bar">
            <button
                className={'btn-gear' + (sidebarOpen ? ' btn-gear-active' : '')}
                onClick={onToggleSidebar}
                aria-label="Settings"
            >
                &#9881;
            </button>
            <input
                ref={inputRef}
                type="text"
                id="prompt"
                placeholder="Ask Claude..."
                autoFocus
                disabled={isProcessing}
                onKeyDown={handleKeyDown}
            />
            {!isProcessing ? (
                <button className="btn" onClick={handleSend}>Send</button>
            ) : (
                <button className="btn btn-stop" onClick={onStop}>Stop</button>
            )}
        </div>
    );
}
