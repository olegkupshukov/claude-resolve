import React, { useRef, useEffect, useState } from 'react';
import Preview from './Preview';
import StatusIndicator from './StatusIndicator';
import { Download } from './Icons';

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
                html: parsed.html, name: parsed.name
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

    if (status === null) {
        return <button className="btn-render" onClick={handleRender}><Download /> Render .mov</button>;
    }
    if (status === 'rendering') {
        return (
            <button className="btn-render" disabled>
                <Download /> Rendering… {progress}%
                <span className="render-progress" style={{ width: progress + '%' }} />
            </button>
        );
    }
    if (status === 'done') {
        return <button className="btn-render" disabled>Added to Timeline &#10003;</button>;
    }
    if (status === 'rendered') {
        return <button className="btn-render" disabled>Rendered &#10003;</button>;
    }
    return <button className="btn-render error" disabled title={errorMsg}>Render Failed</button>;
}

function RenderCard({ parsed, config }) {
    const realtime = parsed.mode === 'realtime';
    return (
        <div className="card">
            <div className="card-head">
                <span className="card-name">{parsed.name}</span>
                <span className={'badge ' + (realtime ? 'realtime' : 'frame')}>
                    <span className="pulse" />{realtime ? 'Realtime' : 'Frame'}
                </span>
            </div>
            <Preview parsed={parsed} />
            <div className="card-foot">
                <div className="specs">
                    <span className="spec"><b>{config.width}×{config.height}</b></span>
                    <span className="spec">{config.fps} fps</span>
                    <span className="spec alpha">ProRes 4444 · α</span>
                </div>
                <RenderMovAction parsed={parsed} />
            </div>
        </div>
    );
}

function MessageBubble({ message, activeTool, tokenCount, model, config }) {
    if (message.type === 'user') {
        return (
            <div className="msg user">
                <div className="msg-content">
                    <div className="bubble">{message.text}</div>
                </div>
            </div>
        );
    }

    const parsed = message.parsed;

    return (
        <div className={'msg assistant' + (message.isError ? ' error' : '')}>
            <div className="av" />
            <div className="msg-content">
                {message.isThinking
                    ? <StatusIndicator tool={activeTool} tokens={tokenCount} model={model} />
                    : parsed
                        ? <RenderCard parsed={parsed} config={config} />
                        : <div className="bubble">{message.text}</div>}
                {parsed && (
                    <details className="code-toggle">
                        <summary>Show code</summary>
                        <pre className="code-block">{message.text}</pre>
                    </details>
                )}
            </div>
        </div>
    );
}

export default function Chat({ messages, activeTool, tokenCount, model, config }) {
    const outputRef = useRef(null);

    useEffect(() => {
        if (outputRef.current) {
            requestAnimationFrame(() => {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
            });
        }
    }, [messages]);

    return (
        <div className="chat" ref={outputRef}>
            {messages.map(msg => (
                <MessageBubble
                    key={msg.id}
                    message={msg}
                    activeTool={msg.isThinking ? activeTool : null}
                    tokenCount={msg.isThinking ? tokenCount : 0}
                    model={model}
                    config={config}
                />
            ))}
        </div>
    );
}
