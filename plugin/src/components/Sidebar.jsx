import React from 'react';
import SidebarAssets from './SidebarAssets';
import SidebarSettings from './SidebarSettings';
import { Folder, Sync, Sliders } from './Icons';

export default function Sidebar({ collapsed, config, onConfigChange, onExpand, updateAvailable }) {
    if (collapsed) {
        return (
            <aside className="sb">
                <div className="sb-rail">
                    <button className="rail-btn active" title="Renders" onClick={onExpand}>
                        <Folder />
                    </button>
                    <button className="rail-btn" title="Sync" onClick={onExpand}>
                        <Sync />
                    </button>
                    <span className="rail-sep" />
                    <button className="rail-btn" title="Settings" onClick={onExpand}>
                        <Sliders />
                        {updateAvailable && <span className="rail-badge" />}
                    </button>
                </div>
            </aside>
        );
    }

    return (
        <aside className="sb">
            <SidebarAssets isOpen={!collapsed} />
            <SidebarSettings config={config} onConfigChange={onConfigChange} />
        </aside>
    );
}
