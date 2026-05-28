import React, { useEffect, useState } from 'react';

function templatePrompt(template) {
    return [
        'Reuse this saved Resolve AI template as the starting point.',
        '',
        `Original request: ${template.prompt || template.name}`,
        '',
        'Previous generated HTML:',
        '```html',
        template.html || '',
        '```',
        '',
        'Create a fresh full replacement HTML file in the same style unless the new request says otherwise.'
    ].join('\n');
}

export default function SidebarTemplates({ onPrompt }) {
    const [templates, setTemplates] = useState([]);

    async function refreshTemplates() {
        if (!window.templateAPI) return;
        setTemplates(await window.templateAPI.list());
    }

    useEffect(() => {
        refreshTemplates();
        const onChanged = () => refreshTemplates();
        window.addEventListener('resolve-ai:templates-changed', onChanged);
        return () => window.removeEventListener('resolve-ai:templates-changed', onChanged);
    }, []);

    async function handleDelete(id) {
        await window.templateAPI.delete(id);
        refreshTemplates();
    }

    function handleUse(template) {
        onPrompt(templatePrompt(template), { displayText: `Use template: ${template.name}` });
    }

    return (
        <div className="sb-section template-section">
            <div className="sb-title"><span>Templates</span></div>
            {templates.length === 0 ? (
                <div className="sb-empty">No saved templates</div>
            ) : (
                <div className="template-list">
                    {templates.map(template => (
                        <div className="template-row" key={template.id}>
                            {template.thumbnail
                                ? <img className="template-thumb" src={template.thumbnail} alt="" />
                                : <div className="template-thumb" />}
                            <div className="template-meta">
                                <div className="template-name">{template.name}</div>
                                <div className="template-sub">
                                    {[template.provider, template.model, template.fps ? `${template.fps}fps` : null].filter(Boolean).join(' · ') || 'Saved template'}
                                </div>
                            </div>
                            <button className="mini-action" onClick={() => handleUse(template)}>Use</button>
                            <button className="render-del always" title="Delete template" onClick={() => handleDelete(template.id)}>
                                &#10005;
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
