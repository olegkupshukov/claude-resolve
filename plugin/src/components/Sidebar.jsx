import React, { useState } from 'react';
import SidebarAssetLibrary from './SidebarAssetLibrary';
import SidebarAssets from './SidebarAssets';
import SidebarCaptions from './SidebarCaptions';
import SidebarPromptGallery from './SidebarPromptGallery';
import SidebarSettings from './SidebarSettings';
import SidebarTemplates from './SidebarTemplates';
import SidebarCreate from './SidebarCreate';
import SidebarTimeline from './SidebarTimeline';
import SidebarVariations from './SidebarVariations';

const TOOL_TABS = [
    ['create', 'Create'],
    ['timeline', 'Timeline'],
    ['assets', 'Assets'],
    ['variations', 'Variations'],
    ['captions', 'Captions'],
    ['gallery', 'Gallery'],
    ['templates', 'Templates'],
    ['renders', 'Renders'],
];

export default function Sidebar({ view = 'tools', config, onConfigChange, onPrompt, onUsePrompt, onShowTools, onClose }) {
    const [activeTool, setActiveTool] = useState(config?.ui?.activeToolTab || 'create');

    if (view === 'settings') {
        return (
            <aside className="sb sb-settings-view">
                <SidebarSettings
                    config={config}
                    onConfigChange={onConfigChange}
                    onShowTools={onShowTools}
                    onClose={onClose}
                />
            </aside>
        );
    }

    function renderActiveTool() {
        if (activeTool === 'create') return <SidebarCreate config={config} onPrompt={onPrompt} />;
        if (activeTool === 'timeline') return <SidebarTimeline config={config} onPrompt={onUsePrompt || onPrompt} />;
        if (activeTool === 'variations') return <SidebarVariations config={config} onConfigChange={onConfigChange} onPrompt={onPrompt} onUsePrompt={onUsePrompt || onPrompt} />;
        if (activeTool === 'renders') return <SidebarAssets onPrompt={onUsePrompt || onPrompt} />;
        if (activeTool === 'gallery') return <SidebarPromptGallery config={config} onConfigChange={onConfigChange} onPrompt={onUsePrompt || onPrompt} />;
        if (activeTool === 'captions') return <SidebarCaptions config={config} onConfigChange={onConfigChange} onPrompt={onPrompt} />;
        if (activeTool === 'templates') return <SidebarTemplates onPrompt={onUsePrompt || onPrompt} />;
        return <SidebarAssetLibrary config={config} onConfigChange={onConfigChange} onPrompt={onUsePrompt || onPrompt} />;
    }

    function handleToolSelect(id) {
        setActiveTool(id);
        onConfigChange?.({ ui: { activeToolTab: id } });
    }

    return (
        <aside className="sb sb-tools-view">
            <div className="tools-header">
                <div className="tools-heading">
                    <span className="tools-eyebrow">Resolve AI</span>
                    <h2>Tools</h2>
                    <p>{TOOL_TABS.find(([id]) => id === activeTool)?.[1] || 'Assets'}</p>
                </div>
                {onClose && (
                    <button className="tools-close" onClick={onClose} aria-label="Close tools">
                        ×
                    </button>
                )}
            </div>
            <div className="tools-tabs" role="tablist" aria-label="Tool sections">
                {TOOL_TABS.map(([id, label]) => (
                    <button
                        type="button"
                        role="tab"
                        id={`tools-tab-${id}`}
                        aria-selected={activeTool === id}
                        aria-controls={`tools-panel-${id}`}
                        className={'tools-tab' + (activeTool === id ? ' active' : '')}
                        onClick={() => handleToolSelect(id)}
                        key={id}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div
                className="tools-panel"
                role="tabpanel"
                id={`tools-panel-${activeTool}`}
                aria-labelledby={`tools-tab-${activeTool}`}
            >
                {renderActiveTool()}
            </div>
        </aside>
    );
}
