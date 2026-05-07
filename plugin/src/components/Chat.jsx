import React, { useRef, useEffect, useState } from 'react';
import Preview from './Preview';
import StatusIndicator from './StatusIndicator';

function OGrafActions({ parsed }) {
    const [status, setStatus] = useState(null);

    async function handleInstall() {
        setStatus('installing');
        try {
            await window.overlayAPI.save(parsed);
            setStatus('done');
        } catch {
            setStatus('error');
        }
    }

    if (status === null) return <button className="btn btn-install" onClick={handleInstall}>Install</button>;
    if (status === 'installing') return <button className="btn btn-install" disabled>Installing...</button>;
    if (status === 'done') return (
        <button className="btn btn-install" disabled>
            Installed &#10003; &mdash; Restart Resolve to find it in Effects Library &gt; Titles &gt; HTML Titles &gt; ClaudeResolve
        </button>
    );
    return <button className="btn btn-install error" disabled>Install Failed</button>;
}

function RenderMovAction({ parsed }) {
    const [status, setStatus] = useState(null);
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (status !== 'rendering') return;
        const cleanup = window.overlayAPI.onRenderProgress((data) => {
            if (data.type === 'progress') setProgress(data.percent);
            else if (data.type === 'encoding') setProgress(100);
        });
        return cleanup;
    }, [status]);

    async function handleRender() {
        setStatus('rendering');
        setProgress(0);
        setErrorMsg('');
        try {
            const result = await window.overlayAPI.renderMov({
                html: parsed.html, fps: 25, width: 1920, height: 1080
            });
            if (result.success) {
                setStatus(result.warning ? 'rendered' : 'done');
            } else {
                setErrorMsg(result.error || 'Unknown error');
                setStatus('error');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Unknown error');
            setStatus('error');
        }
    }

    if (status === null) return <button className="btn btn-install" onClick={handleRender}>Render .mov</button>;
    if (status === 'rendering') return (
        <button className="btn btn-install" disabled>
            Rendering... {progress}%
            <span className="render-progress-bar" style={{ width: progress + '%' }} />
        </button>
    );
    if (status === 'done') return <button className="btn btn-install" disabled>Added to Timeline &#10003;</button>;
    if (status === 'rendered') return <button className="btn btn-install" disabled>Rendered &#10003; (import manually)</button>;
    return <button className="btn btn-install error" disabled title={errorMsg}>Render Failed: {errorMsg}</button>;
}

function MessageBubble({ message, activeTool, tokenCount }) {
    let className = 'message ' + message.type;
    if (message.isThinking) className += ' thinking';
    if (message.isError) className += ' error';

    const parsed = message.parsed;
    const cardName = parsed?.type === 'ograf' ? parsed.templateName : parsed?.name;
    const cardLabel = parsed?.type === 'ograf' ? 'OGraf template' : 'HTML animation';

    return (
        <div className={className}>
            {message.isThinking
                ? <StatusIndicator tool={activeTool} tokens={tokenCount} />
                : parsed
                    ? <>
                        <div className="template-card-header">
                            <span className="template-card-name">{cardName}</span>
                            <span className="template-card-label">{cardLabel}</span>
                        </div>
                        <Preview parsed={parsed} />
                        {parsed.type === 'ograf'
                            ? <OGrafActions parsed={parsed} />
                            : <RenderMovAction parsed={parsed} />}
                        <details className="code-toggle">
                            <summary>Show code</summary>
                            <pre className="code-block">{message.text}</pre>
                        </details>
                    </>
                    : message.text}
            {message.cost != null && (
                <span className="message-cost">${message.cost.toFixed(4)}</span>
            )}
        </div>
    );
}

export default function Chat({ messages, activeTool, tokenCount }) {
    const outputRef = useRef(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div id="output" ref={outputRef}>
            {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} activeTool={msg.isThinking ? activeTool : null} tokenCount={msg.isThinking ? tokenCount : 0} />
            ))}
        </div>
    );
}
