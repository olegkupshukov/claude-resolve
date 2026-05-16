import React, { useState, useEffect } from 'react';
import { Sync } from './Icons';
import { hashGradient } from '../utils/hashGradient';

export default function SidebarAssets({ isOpen }) {
    const [renders, setRenders] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);

    useEffect(() => {
        if (isOpen) refreshRenders();
    }, [isOpen]);

    async function refreshRenders() {
        setRenders(await window.overlayAPI.listRenders());
    }

    async function handleDeleteRender(name) {
        await window.overlayAPI.deleteRender(name);
        refreshRenders();
    }

    async function handleDeleteAllRenders() {
        await window.overlayAPI.deleteAllRenders();
        refreshRenders();
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

    return (
        <div className="sb-section">
            <div className="sb-title">
                <span>Assets · Renders</span>
                <span className="sb-actions">
                    {syncStatus
                        ? <span className="sync-status">{syncStatus}</span>
                        : <button className="sync" onClick={handleSync}><Sync /> Sync</button>}
                    {renders.length > 0 && (
                        <button className="sync" onClick={handleDeleteAllRenders}>Clear</button>
                    )}
                </span>
            </div>

            {renders.length === 0 ? (
                <div className="sb-empty">No renders yet</div>
            ) : (
                <div className="render-list">
                    {renders.map(r => (
                        <div className="render" key={r.name}>
                            {r.thumbnail
                                ? <img className="render-thumb" src={r.thumbnail} alt="" />
                                : <div className="render-thumb" style={{ background: hashGradient(r.name) }} />}
                            <div className="render-meta">
                                <div className="render-name">{r.name}</div>
                                <div className="render-sub">{(r.size / 1048576).toFixed(1)} MB</div>
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
