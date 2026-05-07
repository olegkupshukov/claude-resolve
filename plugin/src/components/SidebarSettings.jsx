import React from 'react';

export default function SidebarSettings({ config, onConfigChange }) {
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
        </div>
    );
}
