import React from 'react';

export default function SidebarMode({ mode, onModeSwitch }) {
    return (
        <div className="sidebar-section">
            <label className="sidebar-label">Mode</label>
            <div className="segmented-control">
                <button
                    className={`segment${mode === 'mov' ? ' segment-active' : ''}`}
                    onClick={() => onModeSwitch('mov')}
                >.mov Render</button>
                <button
                    className={`segment${mode === 'ograf' ? ' segment-active' : ''}`}
                    onClick={() => onModeSwitch('ograf')}
                >OGraf Template</button>
            </div>
        </div>
    );
}
