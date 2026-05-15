import React from 'react';
import SidebarAssets from './SidebarAssets';
import SidebarSettings from './SidebarSettings';

export default function Sidebar({ isOpen, config, onConfigChange, onClose }) {
    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <span className="sidebar-title">Menu</span>
                <button className="btn-icon" onClick={onClose} title="Close">&#10005;</button>
            </div>
            <SidebarAssets isOpen={isOpen} />
            <SidebarSettings config={config} onConfigChange={onConfigChange} />
        </div>
    );
}
