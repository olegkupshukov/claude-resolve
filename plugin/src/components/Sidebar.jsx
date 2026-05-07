import React from 'react';
import SidebarMode from './SidebarMode';
import SidebarAssets from './SidebarAssets';
import SidebarSettings from './SidebarSettings';

export default function Sidebar({ isOpen, config, onConfigChange, onModeSwitch, onClose }) {
    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="sidebar-title">Menu</span>
                <button className="btn-icon" onClick={onClose} title="Close">&#10005;</button>
            </div>
            <SidebarMode mode={config.mode} onModeSwitch={onModeSwitch} />
            <SidebarAssets isOpen={isOpen} />
            <SidebarSettings config={config} onConfigChange={onConfigChange} />
        </div>
    );
}
