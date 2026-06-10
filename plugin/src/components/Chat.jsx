import React, { useRef, useEffect, useState } from 'react';
import Preview from './Preview';
import StatusIndicator from './StatusIndicator';
import { Download } from './Icons';

function RenderMovAction({ parsed }) {
    const [status, setStatus] = useState(null);
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [reason, setReason] = useState('');
    const [warningMsg, setWarningMsg] = useState('');

    useEffect(() => {
        if (status !== 'rendering') return;
        const cleanup = window.overlayAPI.onRenderProgress((data) => {
            if (data.type === 'progress') setProgress(data.percent);
            else if (data.type === 'encoding') setProgress(100);
            // Renderer diagnostics: a warning is informational (shown as a
            // note on the card); an error pre-fills the failure message the
            // close result will confirm moments later.
            else if (data.type === 'warning') setWarningMsg(data.message);
            else if (data.type === 'error') setErrorMsg(data.message);
        });
        return cleanup;
    }, [status]);

    async function handleRender() {
        setStatus('rendering');
        setProgress(0);
        setErrorMsg('');
        setReason('');
        setWarningMsg('');
        try {
            const result = await window.overlayAPI.renderMov({
                html: parsed.html, name: parsed.name
            });
            if (!result.success) {
                // Render itself failed — file was never produced.
                setErrorMsg(result.error || 'Unknown error');
                setStatus('error');
            } else if (result.placed) {
                // Rendered and placed on the timeline.
                setStatus('done');
            } else if (result.imported) {
                // Rendered and in the Media Pool, but couldn't reach the timeline.
                setReason(result.reason || 'unknown reason');
                setStatus('mediapool');
            } else {
                // Rendered to disk, but couldn't even reach the Media Pool.
                setReason(result.reason || 'unknown reason');
                setStatus('rendered');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Unknown error');
            setStatus('error');
        }
    }

    let button;
    if (status === null) {
        button = <button className="btn-render" onClick={handleRender}><Download /> Render .mov</button>;
    } else if (status === 'rendering') {
        button = (
            <button className="btn-render" disabled>
                <Download /> Rendering… {progress}%
                <span className="render-progress" style={{ width: progress + '%' }} />
            </button>
        );
    } else if (status === 'done') {
        button = <button className="btn-render" disabled>Added to Timeline &#10003;</button>;
    } else if (status === 'mediapool') {
        button = (
            <button className="btn-render warn" disabled title={reason}>
                Added to Media Pool — couldn’t place on timeline: {reason}. Drag it in manually.
            </button>
        );
    } else if (status === 'rendered') {
        button = (
            <button className="btn-render warn" disabled title={reason}>
                Rendered to disk — couldn’t add to Media Pool: {reason}.
            </button>
        );
    } else {
        button = (
            <button className="btn-render error" disabled title={errorMsg}>
                Render Failed: {errorMsg}
            </button>
        );
    }
    return (
        <>
            {button}
            {warningMsg && <div className="render-note" title={warningMsg}>⚠ {warningMsg}</div>}
        </>
    );
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
            <Preview parsed={parsed} width={config.width} height={config.height} />
            <div className="card-foot">
                <div className="specs">
                    <span className="spec"><b>{config.width}×{config.height}</b></span>
                    <span className="spec">{config.fps} fps</span>
                    <span className="spec alpha">ProRes 4444</span>
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
