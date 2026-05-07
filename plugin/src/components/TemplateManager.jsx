import React, { useState, useEffect } from 'react';

export default function TemplateManager() {
    const [templates, setTemplates] = useState([]);
    const [renders, setRenders] = useState([]);

    useEffect(() => {
        refreshTemplates();
        refreshRenders();
    }, []);

    async function refreshTemplates() {
        const list = await window.overlayAPI.listTemplates();
        setTemplates(list);
    }

    async function refreshRenders() {
        const list = await window.overlayAPI.listRenders();
        setRenders(list);
    }

    async function handleDeleteTemplate(folder) {
        await window.overlayAPI.deleteTemplate(folder);
        refreshTemplates();
    }

    async function handleDeleteAllTemplates() {
        await window.overlayAPI.deleteAllTemplates();
        refreshTemplates();
    }

    async function handleDeleteRender(name) {
        await window.overlayAPI.deleteRender(name);
        refreshRenders();
    }

    async function handleDeleteAllRenders() {
        await window.overlayAPI.deleteAllRenders();
        refreshRenders();
    }

    return (
        <div id="templates-panel">
            <div className="panel-section-header">
                <span>Installed Templates</span>
                <button className="btn-text" onClick={handleDeleteAllTemplates}>Delete All</button>
            </div>
            <div className="panel-section-list">
                {templates.length === 0 ? (
                    'No templates installed'
                ) : (
                    templates.map(tpl => (
                        <div className="template-row" key={tpl.folder}>
                            <span className="template-name">{tpl.name}</span>
                            <button
                                className="btn-icon btn-delete"
                                title="Delete"
                                onClick={() => handleDeleteTemplate(tpl.folder)}
                            >
                                &#10005;
                            </button>
                        </div>
                    ))
                )}
            </div>
            <div className="panel-section-header panel-section-separator">
                <span>Renders</span>
                <button className="btn-text" onClick={handleDeleteAllRenders}>Delete All</button>
            </div>
            <div className="panel-section-list">
                {renders.length === 0 ? (
                    'No renders'
                ) : (
                    renders.map(r => (
                        <div className="template-row" key={r.name}>
                            <span className="template-name">{r.name}</span>
                            <span className="render-size">{(r.size / 1048576).toFixed(1)} MB</span>
                            <button
                                className="btn-icon btn-delete"
                                title="Delete"
                                onClick={() => handleDeleteRender(r.name)}
                            >
                                &#10005;
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
