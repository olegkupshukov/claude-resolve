import React, { useRef, useEffect, useState } from 'react';
import Preview from './Preview';
import StatusIndicator from './StatusIndicator';
import { Download } from './Icons';

const REGENERATE_ACTIONS = ['More cinematic', 'Simpler', 'Transparent BG', 'Longer', 'Same style', '3 variations'];

function RenderMovAction({ parsed, message, config, provider, model, validation, onRendered, onRepair }) {
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
        let queueJob = null;
        try {
            try {
                const queued = await window.overlayAPI.queue?.({
                    action: 'enqueue',
                    job: {
                        name: parsed.name,
                        prompt: message.prompt,
                        provider,
                        model
                    }
                });
                queueJob = queued?.result;
                if (queueJob?.id) await window.overlayAPI.queue({ action: 'start', id: queueJob.id });
            } catch { /* render queue is best-effort */ }
            const result = await window.overlayAPI.renderMov({
                html: parsed.html,
                name: parsed.name,
                fps: config.fps,
                width: config.width,
                height: config.height,
                metadata: {
                    prompt: message.prompt,
                    provider,
                    model,
                    renderQueueId: queueJob?.id || null,
                    selectedAssetIds: config.selectedAssetIds || [],
                    validationWarnings: validation?.warnings || []
                }
            });
            if (result.success) {
                try {
                    if (queueJob?.id) await window.overlayAPI.queue?.({ action: 'complete', id: queueJob.id, result: { name: result.name, path: result.path } });
                } catch { /* render queue is best-effort */ }
                setStatus(result.warning ? 'rendered' : 'done');
                onRendered?.(result);
                window.dispatchEvent(new CustomEvent('resolve-ai:renders-changed'));
                window.dispatchEvent(new CustomEvent('resolve-ai:render-queue-changed'));
            } else {
                setErrorMsg(result.error || 'Unknown error');
                try {
                    if (queueJob?.id) await window.overlayAPI.queue?.({ action: 'fail', id: queueJob.id, error: result.error || 'Unknown error' });
                } catch { /* render queue is best-effort */ }
                setStatus('error');
                window.dispatchEvent(new CustomEvent('resolve-ai:render-queue-changed'));
            }
        } catch (err) {
            setErrorMsg(err.message || 'Unknown error');
            try {
                if (queueJob?.id) await window.overlayAPI.queue?.({ action: 'fail', id: queueJob.id, error: err.message || 'Unknown error' });
            } catch { /* render queue is best-effort */ }
            setStatus('error');
            window.dispatchEvent(new CustomEvent('resolve-ai:render-queue-changed'));
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
    return (
        <div className="render-error-actions">
            <button className="btn-render error" disabled title={errorMsg}>
                Render Failed: {errorMsg}
            </button>
            <button
                className="mini-action"
                disabled={Number(message.repairCount || 0) >= 2}
                onClick={() => onRepair?.(message, {
                    error: errorMsg,
                    validationWarnings: validation?.warnings || []
                })}
            >
                {Number(message.repairCount || 0) >= 2 ? 'Repair limit reached' : 'Fix with AI'}
            </button>
        </div>
    );
}

function RenderCard({ message, parsed, config, provider, model, onRegenerate, onRepair }) {
    const realtime = parsed.mode === 'realtime';
    const [validation, setValidation] = useState(null);
    const [saveStatus, setSaveStatus] = useState('');
    const [renderResult, setRenderResult] = useState(null);

    useEffect(() => {
        let alive = true;
        if (!window.overlayAPI?.validate) return undefined;
        window.overlayAPI.validate({ html: parsed.html, prompt: message.prompt, config })
            .then(result => { if (alive) setValidation(result); })
            .catch(() => { if (alive) setValidation(null); });
        return () => { alive = false; };
    }, [parsed.html, message.prompt, config.width, config.height, config.fps]);

    async function handleSaveTemplate() {
        if (!window.templateAPI) return;
        setSaveStatus('Saving');
        await window.templateAPI.save({
            name: parsed.name,
            prompt: message.prompt,
            html: parsed.html,
            thumbnail: renderResult?.metadata?.thumbnail || null,
            provider,
            model,
            width: config.width,
            height: config.height,
            fps: config.fps
        });
        setSaveStatus('Saved');
        window.dispatchEvent(new CustomEvent('resolve-ai:templates-changed'));
        setTimeout(() => setSaveStatus(''), 1800);
    }

    return (
        <div className="card">
            <div className="card-head">
                <span className="card-name">{parsed.name}</span>
                <span className={'badge ' + (realtime ? 'realtime' : 'frame')}>
                    <span className="pulse" />{realtime ? 'Realtime' : 'Frame'}
                </span>
            </div>
            <Preview parsed={parsed} selectedAssetIds={config.selectedAssetIds || []} />
            {validation?.warnings?.length > 0 && (
                <div className="validation-list">
                    {validation.warnings.map(warning => (
                        <div className={'validation ' + warning.severity} key={warning.code}>
                            {warning.message}
                        </div>
                    ))}
                </div>
            )}
            <div className="card-foot">
                <div className="specs">
                    <span className="spec"><b>{config.width}×{config.height}</b></span>
                    <span className="spec">{config.fps} fps</span>
                    <span className="spec alpha">ProRes 4444</span>
                </div>
                <RenderMovAction
                    parsed={parsed}
                    message={message}
                    config={config}
                    provider={provider}
                    model={model}
                    validation={validation}
                    onRendered={setRenderResult}
                    onRepair={onRepair}
                />
            </div>
            <div className="card-actions">
                <button className="mini-action" onClick={handleSaveTemplate}>
                    {saveStatus || 'Save as Template'}
                </button>
                {REGENERATE_ACTIONS.map(action => (
                    <button
                        key={action}
                        className="mini-action"
                        onClick={() => onRegenerate?.(message, action)}
                    >
                        {action}
                    </button>
                ))}
            </div>
        </div>
    );
}

function VariationSetCard({ message, parsed, config, provider, model, onRegenerate, onRepair }) {
    return (
        <div className="variation-result-set">
            <div className="variation-result-head">
                <strong>{parsed.items.length} variations</strong>
                <span>Choose one to render, save, or refine.</span>
            </div>
            <div className="variation-result-grid">
                {parsed.items.map((item, index) => (
                    <RenderCard
                        key={`${item.name}-${index}`}
                        message={{ ...message, parsed: item }}
                        parsed={item}
                        config={config}
                        provider={provider}
                        model={model}
                        onRegenerate={onRegenerate}
                        onRepair={onRepair}
                    />
                ))}
            </div>
        </div>
    );
}

function MessageBubble({ message, activeTool, tokenCount, model, provider, config, onRegenerate, onRepair }) {
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
                    ? <StatusIndicator tool={activeTool} tokens={tokenCount} model={model} provider={provider} />
                    : parsed
                        ? parsed.type === 'variations'
                            ? <VariationSetCard
                                message={message}
                                parsed={parsed}
                                config={config}
                                provider={provider}
                                model={model}
                                onRegenerate={onRegenerate}
                                onRepair={onRepair}
                            />
                            : <RenderCard
                                message={message}
                                parsed={parsed}
                                config={config}
                                provider={provider}
                                model={model}
                                onRegenerate={onRegenerate}
                                onRepair={onRepair}
                            />
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

export default function Chat({ messages, activeTool, tokenCount, model, provider, config, onRegenerate, onRepair }) {
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
                    provider={provider}
                    config={config}
                    onRegenerate={onRegenerate}
                    onRepair={onRepair}
                />
            ))}
        </div>
    );
}
