import React, { useState, useEffect } from 'react';

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
            setSyncStatus(result.synced > 0 ? `Synced ${result.synced}` : 'All synced ✓');
        } catch {
            setSyncStatus('Sync failed');
        }
        setTimeout(() => setSyncStatus(null), 3000);
    }

    return (
        <div className="sidebar-section">
            <label className="sidebar-label">Assets</label>

            <div className="sidebar-subsection">
                <div className="sidebar-sub-header">
                    <span>Renders</span>
                    <span className="panel-header-actions">
                        {syncStatus
                            ? <span className="sync-status">{syncStatus}</span>
                            : <button className="btn-text" onClick={handleSync}>Sync</button>}
                        {renders.length > 0 && (
                            <button className="btn-text" onClick={handleDeleteAllRenders}>Delete All</button>
                        )}
                    </span>
                </div>
                {renders.length === 0 ? (
                    <div className="sidebar-empty">No renders</div>
                ) : (
                    renders.map(r => (
                        <div className="template-row" key={r.name}>
                            <span className="template-name">{r.name}</span>
                            <span className="render-size">{(r.size / 1048576).toFixed(1)} MB</span>
                            <button className="btn-icon btn-delete" title="Delete" onClick={() => handleDeleteRender(r.name)}>&#10005;</button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
