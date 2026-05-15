import React, { useState, useEffect } from 'react';

export default function SidebarSettings({ config, onConfigChange }) {
    const [update, setUpdate] = useState(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        window.updatesAPI.check()
            .then(setUpdate)
            .catch(() => setUpdate({ error: 'offline' }))
            .finally(() => setChecking(false));
    }, []);

    function handleCheck() {
        setChecking(true);
        window.updatesAPI.check()
            .then(setUpdate)
            .catch(() => setUpdate({ error: 'offline' }))
            .finally(() => setChecking(false));
    }

    function renderUpdateStatus() {
        if (checking) return <span className="update-status">Checking…</span>;
        if (!update) return null;
        if (update.error) return <span className="update-status update-status-error">Check failed</span>;
        if (update.hasUpdate) {
            return (
                <button
                    className="btn-text update-status update-status-available"
                    onClick={() => window.windowAPI.openExternal(update.downloadUrl)}
                >
                    Update available: v{String(update.latest).replace(/^v/, '')}
                </button>
            );
        }
        return <span className="update-status">Up to date</span>;
    }

    return (
        <div className="sidebar-section">
            <label className="sidebar-label">Settings</label>
            <div className="sidebar-setting">
                <span>Model</span>
                <select value={config.model || 'sonnet'} onChange={e => onConfigChange({ model: e.target.value })}>
                    <option value="sonnet">Sonnet (fast)</option>
                    <option value="opus">Opus (smart)</option>
                </select>
            </div>
            <div className="sidebar-setting">
                <span>FPS</span>
                <select value={config.fps} onChange={e => onConfigChange({ fps: Number(e.target.value) })}>
                    <option value={24}>24</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                    <option value={60}>60</option>
                </select>
            </div>
            <div className="sidebar-setting">
                <span>Resolution</span>
                <select
                    value={`${config.width}x${config.height}`}
                    onChange={e => {
                        const [w, h] = e.target.value.split('x').map(Number);
                        onConfigChange({ width: w, height: h });
                    }}
                >
                    <option value="1920x1080">1920x1080</option>
                    <option value="3840x2160">3840x2160</option>
                </select>
            </div>
            <div className="sidebar-setting">
                <span>Version {update?.current ? `v${update.current}` : ''}</span>
                <span className="sidebar-setting-actions">
                    {renderUpdateStatus()}
                    <button className="btn-text" onClick={handleCheck} disabled={checking}>
                        Check for Updates
                    </button>
                </span>
            </div>
        </div>
    );
}
