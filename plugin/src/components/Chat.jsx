import React, { useRef, useEffect } from 'react';
import StatusIndicator from './StatusIndicator';

function MessageBubble({ message, activeTool, onOpenPreview }) {
    let className = 'message ' + message.type;
    if (message.isThinking) className += ' thinking';
    if (message.isError) className += ' error';

    return (
        <div className={className}>
            {message.isThinking
                ? <StatusIndicator tool={activeTool} />
                : message.text}
            {message.parsed && (
                <button className="btn-text btn-open-preview"
                    onClick={() => onOpenPreview(message.parsed)}>
                    Open preview
                </button>
            )}
            {message.cost != null && (
                <span className="message-cost">${message.cost.toFixed(4)}</span>
            )}
        </div>
    );
}

export default function Chat({ messages, activeTool, onOpenPreview }) {
    const outputRef = useRef(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div id="output" ref={outputRef}>
            {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg}
                    activeTool={msg.isThinking ? activeTool : null}
                    onOpenPreview={onOpenPreview} />
            ))}
        </div>
    );
}
