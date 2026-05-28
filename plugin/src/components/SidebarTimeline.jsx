import React, { useEffect, useState } from 'react';
import { hashGradient } from '../utils/hashGradient';

const ACTIONS = [
    ['title', 'Title at playhead', 'Generate a title for the current timeline position.'],
    ['lower-third', 'Lower third', 'Generate a transparent lower third at the playhead.'],
    ['transition', 'Transition', 'Generate a short transition overlay at the playhead.']
];

function contextText(context) {
    if (!context) return 'Checking timeline';
    if (!context.available) return 'Timeline unavailable';
    const size = context.width && context.height ? `${context.width}x${context.height}` : 'size unavailable';
    const fps = context.fps ? `${context.fps}fps` : 'fps unavailable';
    return `${context.timelineName || 'Timeline'} / ${size} / ${fps}`;
}

function selectedClipText(context) {
    const clips = context?.selectedClips || [];
    if (!clips.length) return 'Selected clip unavailable';
    if (clips.length === 1) return clips[0].name || clips[0].fileName || 'Selected clip';
    return `${clips.length} selected clips`;
}

export default function SidebarTimeline({ config, onPrompt }) {
    const [context, setContext] = useState(null);
    const [renders, setRenders] = useState([]);
    const [status, setStatus] = useState('');

    useEffect(() => {
        refresh();
        const onChanged = () => refreshRenders();
        window.addEventListener('resolve-ai:renders-changed', onChanged);
        return () => window.removeEventListener('resolve-ai:renders-changed', onChanged);
    }, []);

    async function refresh() {
        await Promise.all([refreshContext(), refreshRenders()]);
    }

    async function refreshContext() {
        try {
            const next = await window.timelineAPI.getContext();
            setContext(next);
        } catch {
            setContext({ available: false, unavailable: ['timeline context'] });
        }
    }

    async function refreshRenders() {
        if (!window.overlayAPI?.listRenders) return;
        setRenders((await window.overlayAPI.listRenders()).slice(0, 4));
    }

    async function generate(type, render = null) {
        setStatus('Preparing');
        try {
            const result = await window.timelineAPI.generateAtPlayhead({
                type,
                render,
                context: context || {
                    fps: config.fps,
                    width: config.width,
                    height: config.height
                }
            });
            if (result?.prompt) {
                const accepted = onPrompt(result.prompt, { displayText: result.displayText || 'Timeline action' });
                setStatus(accepted === false ? 'Finish current run first' : 'Added to composer');
                setTimeout(() => setStatus(''), 1800);
            }
        } catch {
            setStatus('Timeline action failed');
            setTimeout(() => setStatus(''), 2200);
        }
    }

    return (
        <div className="sb-section timeline-section">
            <div className="sb-title">
                <span>Timeline</span>
                <span className="sb-actions">
                    {status && <span className="sync-status">{status}</span>}
                    <button className="sync" onClick={refresh}>Refresh</button>
                </span>
            </div>

            <div className="timeline-context-card">
                <span className={'status-dot ' + (context?.available ? 'ready' : 'warn')} />
                <div>
                    <strong>{contextText(context)}</strong>
                    <p>
                        {context?.currentTimecode ? `Playhead ${context.currentTimecode}` : 'Playhead unavailable'}
                        {' / '}
                        {selectedClipText(context)}
                        {context?.unavailable?.length ? ` / Unavailable: ${context.unavailable.slice(0, 2).join(', ')}` : ''}
                    </p>
                </div>
            </div>

            <div className="timeline-action-list">
                {ACTIONS.map(([type, label, help]) => (
                    <button className="timeline-action" key={type} onClick={() => generate(type)}>
                        <span>{label}</span>
                        <small>{help}</small>
                    </button>
                ))}
            </div>

            <div className="timeline-subhead">Recent renders</div>
            {renders.length === 0 ? (
                <div className="sb-empty">No render history yet</div>
            ) : (
                <div className="timeline-render-list">
                    {renders.map(render => (
                        <article className="timeline-render" key={render.name}>
                            {render.thumbnail
                                ? <img src={render.thumbnail} alt="" />
                                : <span style={{ background: hashGradient(render.name) }} />}
                            <div>
                                <strong title={render.name}>{render.name}</strong>
                                <small>{render.metadata?.provider || 'local render'}</small>
                            </div>
                            <button className="mini-action" onClick={() => generate('rerender', render)}>Re-render</button>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
