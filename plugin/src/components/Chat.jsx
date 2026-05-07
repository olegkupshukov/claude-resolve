import React, { useRef, useEffect, useState } from 'react';
import Preview from './Preview';
import StatusIndicator from './StatusIndicator';

function MessageBubble({ message, activeTool }) {
    const [installStatus, setInstallStatus] = useState(null);

    let className = 'message ' + message.type;
    if (message.isThinking) className += ' thinking';
    if (message.isError) className += ' error';

    async function handleInstall() {
        setInstallStatus('installing');
        try {
            await window.overlayAPI.save(message.parsed);
            setInstallStatus('done');
        } catch {
            setInstallStatus('error');
        }
    }

    let installBtn = null;
    if (message.parsed) {
        if (installStatus === null) {
            installBtn = <button className="btn btn-install" onClick={handleInstall}>Install</button>;
        } else if (installStatus === 'installing') {
            installBtn = <button className="btn btn-install" disabled>Installing...</button>;
        } else if (installStatus === 'done') {
            installBtn = (
                <button className="btn btn-install" disabled>
                    Installed &#10003; &mdash; Restart Resolve to find it in Effects Library &gt; Titles &gt; HTML Titles &gt; ClaudeResolve
                </button>
            );
        } else {
            installBtn = <button className="btn btn-install error" disabled>Install Failed</button>;
        }
    }

    return (
        <div className={className}>
            {message.isThinking
                ? <StatusIndicator tool={activeTool} />
                : message.text}
            {message.parsed && <Preview parsed={message.parsed} />}
            {installBtn}
            {message.cost != null && (
                <span className="message-cost">${message.cost.toFixed(4)}</span>
            )}
        </div>
    );
}

export default function Chat({ messages, activeTool }) {
    const outputRef = useRef(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div id="output" ref={outputRef}>
            {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} activeTool={msg.isThinking ? activeTool : null} />
            ))}
        </div>
    );
}
