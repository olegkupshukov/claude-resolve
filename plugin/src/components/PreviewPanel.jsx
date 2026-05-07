import React, { useState, useEffect, useMemo } from 'react';
import Preview from './Preview';
import ParamEditor from './ParamEditor';

function getDefaults(parsed) {
    try {
        const manifest = JSON.parse(parsed.manifestJSON);
        const props = manifest.schema?.properties;
        if (!props) return {};
        const defaults = {};
        for (const [key, prop] of Object.entries(props)) {
            if (prop.default !== undefined) defaults[key] = prop.default;
        }
        return defaults;
    } catch { return {}; }
}

export default function PreviewPanel({ parsed, onClose, onIterate }) {
    const [params, setParams] = useState(() => getDefaults(parsed));
    const [installStatus, setInstallStatus] = useState(null);
    const [iterateText, setIterateText] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const manifest = useMemo(() => {
        try { return JSON.parse(parsed.manifestJSON); }
        catch { return null; }
    }, [parsed]);

    function handleParamChange(key, value) {
        setParams(prev => ({ ...prev, [key]: value }));
    }

    async function handleInstall() {
        setInstallStatus('installing');
        try {
            await window.overlayAPI.save(parsed);
            setInstallStatus('done');
        } catch {
            setInstallStatus('error');
        }
    }

    function handleIterate() {
        if (!iterateText.trim()) return;
        onIterate(iterateText.trim());
    }

    return (
        <div id="preview-panel" data-mounted={mounted || undefined}>
            <div className="panel-header">
                <span className="panel-title">{manifest?.name || 'Preview'}</span>
                <button className="btn-icon" onClick={onClose}>{'\u2715'}</button>
            </div>
            <div className="panel-content">
                <Preview parsed={parsed} params={params} />
                {manifest?.schema?.properties && (
                    <ParamEditor
                        schema={manifest.schema.properties}
                        values={params}
                        onChange={handleParamChange}
                    />
                )}
            </div>
            <div className="panel-actions">
                <div className="panel-iterate">
                    <input
                        type="text"
                        placeholder="Describe changes..."
                        value={iterateText}
                        onChange={e => setIterateText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleIterate()}
                    />
                    <button className="btn btn-iterate" onClick={handleIterate}
                        disabled={!iterateText.trim()}>Iterate</button>
                </div>
                {installStatus === null && (
                    <button className="btn btn-install" onClick={handleInstall}>Install</button>
                )}
                {installStatus === 'installing' && (
                    <button className="btn btn-install" disabled>Installing...</button>
                )}
                {installStatus === 'done' && (
                    <button className="btn btn-install" disabled>
                        Installed &#10003; &mdash; Restart Resolve
                    </button>
                )}
                {installStatus === 'error' && (
                    <button className="btn btn-install error" disabled>Install Failed</button>
                )}
            </div>
        </div>
    );
}
