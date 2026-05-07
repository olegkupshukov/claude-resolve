import React, { useState, useEffect } from 'react';

export default function TemplateManager() {
    const [templates, setTemplates] = useState([]);

    useEffect(() => {
        refreshList();
    }, []);

    async function refreshList() {
        const list = await window.overlayAPI.listTemplates();
        setTemplates(list);
    }

    async function handleDelete(folder) {
        await window.overlayAPI.deleteTemplate(folder);
        refreshList();
    }

    async function handleDeleteAll() {
        await window.overlayAPI.deleteAllTemplates();
        refreshList();
    }

    return (
        <div id="templates-panel">
            <div id="templates-header">
                <span>Installed Templates</span>
                <button className="btn-text" onClick={handleDeleteAll}>Delete All</button>
            </div>
            <div id="templates-list">
                {templates.length === 0 ? (
                    'No templates installed'
                ) : (
                    templates.map(tpl => (
                        <div className="template-row" key={tpl.folder}>
                            <span className="template-name">{tpl.name}</span>
                            <button
                                className="btn-icon btn-delete"
                                title="Delete"
                                onClick={() => handleDelete(tpl.folder)}
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
