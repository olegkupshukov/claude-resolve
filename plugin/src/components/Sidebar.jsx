import React from 'react';
import SidebarAssets from './SidebarAssets';
import SidebarSettings from './SidebarSettings';

export default function Sidebar({ config, onConfigChange }) {
    return (
        <aside className="sb">
            <SidebarAssets />
            <SidebarSettings config={config} onConfigChange={onConfigChange} />
        </aside>
    );
}
