import React, { useState, useEffect } from 'react';
import { Sync, Folder } from './Icons';
import { hashGradient } from '../utils/hashGradient';

function rerenderPrompt(render) {
    const metadata = render.metadata || {};
    return [
        'Re-render this saved Resolve AI result from history.',
        '',
        `Original request: ${metadata.prompt || render.name}`,
        '',
        metadata.html ? 'Previous generated HTML:' : '',
        metadata.html ? '```html' : '',
        metadata.html || '',
        metadata.html ? '```' : '',
        '',
        'Return one complete replacement HTML file.'
    ].filter(Boolean).join('\n');
}

export default function SidebarAssets({ onPrompt }) {
    const [renders, setRenders] = useState([]);
    const [queueJobs, setQueueJobs] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);
    const [query, setQuery] = useState('');

    useEffect(() => {
        refreshRenders();
        const onChanged = () => refreshRenders();
        const onQueueChanged = () => refreshQueue();
        window.addEventListener('resolve-ai:renders-changed', onChanged);
        window.addEventListener('resolve-ai:render-queue-changed', onQueueChanged);
        refreshQueue();
        return () => {
            window.removeEventListener('resolve-ai:renders-changed', onChanged);
            window.removeEventListener('resolve-ai:render-queue-changed', onQueueChanged);
        };
    }, []);

    async function refreshRenders() {
        setRenders(await window.overlayAPI.listRenders());
    }

    async function refreshQueue() {
        if (!window.overlayAPI?.queue) return;
        const result = await window.overlayAPI.queue({ action: 'list' });
        setQueueJobs(result?.jobs || []);
    }

    async function handleDeleteRender(name) {
        await window.overlayAPI.deleteRender(name);
        refreshRenders();
    }

    async function handleDeleteAllRenders() {
        await window.overlayAPI.deleteAllRenders();
        refreshRenders();
    }

    function handleReveal(name) {
        window.overlayAPI.revealRender(name);
    }

    async function handleRename(render) {
        const base = render.name.replace(/\.mov$/i, '');
        const nextName = window.prompt('Render name', base);
        if (!nextName || nextName === base) return;
        const result = await window.overlayAPI.renameRender(render.name, nextName);
        if (!result?.success) {
            setSyncStatus(result?.error || 'Rename failed');
            setTimeout(() => setSyncStatus(null), 3000);
        }
        refreshRenders();
    }

    function handleRerender(render) {
        if (!onPrompt) return;
        onPrompt(rerenderPrompt(render), { displayText: `Re-render: ${render.name}` });
    }

    async function handleSync() {
        setSyncStatus('syncing');
        try {
            const result = await window.overlayAPI.syncToMediaPool();
            setSyncStatus(result.synced > 0 ? `Synced ${result.synced}` : 'All synced');
        } catch {
            setSyncStatus('Sync failed');
        }
        setTimeout(() => setSyncStatus(null), 3000);
    }

    async function handleQueueAction(action, id) {
        await window.overlayAPI.queue({ action, id });
        await refreshQueue();
    }

    const filteredRenders = renders.filter(render => {
        const haystack = [
            render.name,
            render.metadata?.prompt,
            render.metadata?.provider,
            render.metadata?.model
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query.toLowerCase());
    });

    return (
        <div className="sb-section render-history-section">
            <div className="sb-title">
                <span>Render History</span>
                <span className="sb-actions">
                    {syncStatus
                        ? <span className="sync-status">{syncStatus}</span>
                        : <button className="sync" onClick={handleSync}><Sync /> Sync</button>}
                    {renders.length > 0 && (
                        <button className="sync" onClick={handleDeleteAllRenders}>Clear</button>
                    )}
                </span>
            </div>

            <input
                className="sb-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search renders"
            />

            {queueJobs.length > 0 && (
                <div className="render-queue-panel">
                    <div className="timeline-subhead">Render queue</div>
                    {queueJobs.slice(0, 5).map(job => (
                        <div className="render-queue-job" key={job.id}>
                            <div>
                                <strong>{job.name || job.id}</strong>
                                <span>{job.status} / attempts {job.attempts || 0}</span>
                            </div>
                            {['queued', 'rendering'].includes(job.status) && (
                                <button className="mini-action" onClick={() => handleQueueAction('cancel', job.id)}>Cancel</button>
                            )}
                            {['failed', 'canceled', 'interrupted'].includes(job.status) && (
                                <button className="mini-action" onClick={() => handleQueueAction('retry', job.id)}>Retry</button>
                            )}
                        </div>
                    ))}
                    <button className="mini-action" onClick={() => handleQueueAction('clearCompleted')}>Clear finished</button>
                </div>
            )}

            {renders.length === 0 ? (
                <div className="sb-empty">No renders yet</div>
            ) : (
                <div className="render-list">
                    {filteredRenders.map(r => (
                        <div className="render" key={r.name}>
                            {r.thumbnail
                                ? <img className="render-thumb" src={r.thumbnail} alt="" />
                                : <div className="render-thumb" style={{ background: hashGradient(r.name) }} />}
                            <div className="render-meta">
                                <div className="render-name-row">
                                    <span className="render-name">{r.name}</span>
                                    <button
                                        className="render-open"
                                        title="Open folder"
                                        onClick={() => handleReveal(r.name)}
                                    >
                                        <Folder />
                                    </button>
                                </div>
                                <div className="render-sub">
                                    {(r.size / 1048576).toFixed(1)} MB
                                    {r.metadata?.provider ? ` · ${r.metadata.provider}` : ''}
                                </div>
                                <div className="render-actions">
                                    <button className="mini-action" onClick={() => handleRerender(r)}>Re-render</button>
                                    <button className="mini-action" onClick={() => handleRename(r)}>Rename</button>
                                </div>
                            </div>
                            <button
                                className="render-del"
                                title="Delete"
                                onClick={() => handleDeleteRender(r.name)}
                            >
                                &#10005;
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
