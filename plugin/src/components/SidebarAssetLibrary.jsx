import React, { useEffect, useMemo, useState } from 'react';
import { Folder } from './Icons';
import { hashGradient } from '../utils/hashGradient';

const CATEGORY_OPTIONS = [
    ['logo', 'Logo'],
    ['texture', 'Texture'],
    ['product', 'Product'],
    ['background', 'Background'],
    ['icon', 'Icon'],
    ['reference', 'Reference'],
    ['other', 'Other']
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS);

function formatAssetSize(size) {
    if (!size) return 'Local file';
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SidebarAssetLibrary({ config, onConfigChange, onPrompt }) {
    const [assets, setAssets] = useState([]);
    const [status, setStatus] = useState('');
    const [activeId, setActiveId] = useState(null);
    const [activeDetails, setActiveDetails] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const selectedIds = useMemo(() => new Set(config.selectedAssetIds || []), [config.selectedAssetIds]);
    const selectedCount = assets.filter(asset => selectedIds.has(asset.id)).length;
    const pinnedCount = assets.filter(asset => asset.alwaysInclude).length;
    const activeAsset = useMemo(() => {
        if (assets.length === 0) return null;
        return assets.find(asset => asset.id === activeId) || assets[0];
    }, [assets, activeId]);

    useEffect(() => {
        refreshAssets();
        const onChanged = () => refreshAssets();
        window.addEventListener('resolve-ai:assets-changed', onChanged);
        return () => window.removeEventListener('resolve-ai:assets-changed', onChanged);
    }, []);

    async function refreshAssets() {
        if (!window.assetAPI) return;
        const nextAssets = await window.assetAPI.list();
        setAssets(nextAssets);
        setActiveId(current => {
            if (nextAssets.some(asset => asset.id === current)) return current;
            return nextAssets[0]?.id || null;
        });
    }

    async function refreshInspection(id = activeId) {
        if (!id || !window.assetAPI?.inspect) {
            setActiveDetails(null);
            return;
        }
        const result = await window.assetAPI.inspect(id);
        setActiveDetails(result?.success ? result.asset : null);
    }

    useEffect(() => {
        refreshInspection(activeId);
    }, [activeId]);

    async function importPaths(paths) {
        const validPaths = paths.filter(Boolean);
        if (validPaths.length === 0) {
            setStatus('No file paths');
            setTimeout(() => setStatus(''), 2200);
            return;
        }
        setStatus('Importing');
        try {
            const result = await window.assetAPI.add({ paths: validPaths });
            const addedIds = (result?.added || []).map(asset => asset.id);
            if (addedIds.length > 0) {
                const next = Array.from(new Set([...(config.selectedAssetIds || []), ...addedIds]));
                await onConfigChange({ selectedAssetIds: next });
                setActiveId(addedIds[0]);
                setStatus(`Imported ${addedIds.length}`);
            } else {
                setStatus('No supported assets');
            }
            await refreshAssets();
            window.dispatchEvent(new CustomEvent('resolve-ai:assets-changed'));
        } catch {
            setStatus('Import failed');
        }
        setTimeout(() => setStatus(''), 2200);
    }

    async function handleAdd() {
        setStatus('Adding');
        try {
            const result = await window.assetAPI.add();
            const addedIds = (result?.added || []).map(asset => asset.id);
            if (addedIds.length > 0) {
                const next = Array.from(new Set([...(config.selectedAssetIds || []), ...addedIds]));
                await onConfigChange({ selectedAssetIds: next });
                setStatus(`Added ${addedIds.length}`);
            } else {
                setStatus('No asset added');
            }
            await refreshAssets();
            window.dispatchEvent(new CustomEvent('resolve-ai:assets-changed'));
        } catch {
            setStatus('Add failed');
        }
        setTimeout(() => setStatus(''), 2200);
    }

    async function handleDrop(event) {
        event.preventDefault();
        setIsDragging(false);
        const paths = Array.from(event.dataTransfer?.files || []).map(file => file.path);
        await importPaths(paths);
    }

    async function handleToggle(id) {
        const next = selectedIds.has(id)
            ? (config.selectedAssetIds || []).filter(assetId => assetId !== id)
            : [...(config.selectedAssetIds || []), id];
        await onConfigChange({ selectedAssetIds: next });
    }

    async function ensureAttached(id) {
        if (selectedIds.has(id)) return;
        const next = Array.from(new Set([...(config.selectedAssetIds || []), id]));
        await onConfigChange({ selectedAssetIds: next });
    }

    async function handleNotes(id, notes) {
        await window.assetAPI.update(id, { notes });
        refreshAssets();
    }

    async function handlePatch(id, patch) {
        await window.assetAPI.update(id, patch);
        await refreshAssets();
        await refreshInspection(id);
    }

    async function handleDelete(id) {
        await window.assetAPI.delete(id);
        await onConfigChange({
            selectedAssetIds: (config.selectedAssetIds || []).filter(assetId => assetId !== id)
        });
        refreshAssets();
    }

    async function handleExtractColors() {
        if (!activeAsset?.id || !window.assetAPI?.extractColors) return;
        const result = await window.assetAPI.extractColors(activeAsset.id);
        if (result?.success && result.colors?.length) {
            await onConfigChange({ brandKit: { ...(config.brandKit || {}), colors: result.colors.join(', ') } });
            setStatus('Colors saved');
        } else {
            setStatus('No colors');
        }
        setTimeout(() => setStatus(''), 2200);
    }

    async function handleQuickPrompt(kind) {
        if (!activeAsset) return;
        await ensureAttached(activeAsset.id);
        const prompts = {
            logo: `Use the selected logo asset "${activeAsset.name}" as the central mark in a polished 5 second transparent title reveal. Keep the asset crisp, full size, recognizable, and do not redraw it.`,
            background: `Use the selected image asset "${activeAsset.name}" as the main background or visual plate for a cinematic 5 second title card. Preserve the image identity and add refined motion graphics on top.`,
            product: `Use the selected product asset "${activeAsset.name}" in a premium product reveal. Keep the product recognizable, avoid covering it with text, and create a 5 second ProRes 4444 overlay.`,
            texture: `Use the selected texture asset "${activeAsset.name}" subtly in the background while keeping typography readable, motion refined, and the final frame polished.`
        };
        onPrompt?.(prompts[kind], { displayText: `Asset prompt: ${activeAsset.name}` });
    }

    const inspected = activeDetails?.id === activeAsset?.id ? activeDetails : activeAsset;
    const health = inspected?.health || [];
    const dimensions = inspected?.dimensions;

    return (
        <div
            className={'sb-section asset-library-section' + (isDragging ? ' dragging' : '')}
            onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            <div className="sb-title">
                <span>Asset Library</span>
                <span className="sb-actions">
                    {status && <span className="sync-status">{status}</span>}
                    <button className="sync asset-add" onClick={handleAdd}>Add asset</button>
                </span>
            </div>

            {assets.length === 0 ? (
                <div className="asset-empty-card">
                    <div className="asset-empty-art" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                    </div>
                    <div>
                        <strong>No assets yet</strong>
                        <p>Add logos, product shots, backgrounds, textures, or reference images. Assets stay local and can be attached to the next prompt.</p>
                    </div>
                    <button className="sync asset-empty-action" onClick={handleAdd}>Add first asset</button>
                </div>
            ) : (
                <>
                    <div className="asset-drop-zone">
                        Drop images here or use Add asset. PNG, JPG, WEBP, SVG, and GIF stay local.
                    </div>
                    <div className="asset-library-meta">
                        <span>{assets.length} asset{assets.length === 1 ? '' : 's'}</span>
                        <span>{selectedCount} attached</span>
                        <span>{pinnedCount} pinned</span>
                    </div>
                    <div className="asset-list">
                        {assets.map(asset => {
                            const selected = selectedIds.has(asset.id);
                            const category = asset.category || 'reference';
                            return (
                                <article
                                    className={'asset-row' + (selected ? ' selected' : '') + (activeAsset?.id === asset.id ? ' active' : '')}
                                    key={asset.id}
                                >
                                    <button
                                        className="asset-row-main"
                                        onClick={() => setActiveId(asset.id)}
                                        aria-pressed={activeAsset?.id === asset.id}
                                        title="Edit asset details"
                                    >
                                        <span className="asset-row-thumb-wrap">
                                            {asset.url && asset.exists
                                                ? <img className="asset-row-thumb" src={asset.url} alt="" />
                                                : <span className="asset-row-thumb" style={{ background: hashGradient(asset.name) }} />}
                                        </span>
                                        <span className="asset-row-copy">
                                            <span className="asset-row-name">{asset.name}</span>
                                            <span className="asset-row-sub">
                                                {CATEGORY_LABELS[category] || 'Reference'} / {asset.ext || 'image'} / {formatAssetSize(asset.size)}
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        className={'asset-attach' + (selected ? ' selected' : '')}
                                        onClick={() => handleToggle(asset.id)}
                                        aria-pressed={selected}
                                        title={selected ? 'Detach from next prompts' : 'Attach to next prompts'}
                                    >
                                        {selected ? 'On' : 'Use'}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                    {activeAsset && (
                        <div className="asset-inspector">
                            <div className="asset-inspector-head">
                                <div className="asset-inspector-copy">
                                    <span className="asset-inspector-label">Editing</span>
                                    <strong title={activeAsset.name}>{activeAsset.name}</strong>
                                </div>
                                <button
                                    className="asset-icon-button"
                                    title="Open asset folder"
                                    onClick={() => window.assetAPI.reveal(activeAsset.id)}
                                >
                                    <Folder />
                                </button>
                                <button
                                    className="asset-icon-button danger"
                                    title="Delete asset"
                                    onClick={() => handleDelete(activeAsset.id)}
                                >
                                    &#10005;
                                </button>
                            </div>

                            <textarea
                                className="asset-notes"
                                key={activeAsset.id}
                                defaultValue={activeAsset.notes || ''}
                                onBlur={e => handleNotes(activeAsset.id, e.target.value)}
                                placeholder="Notes for AI: what is this, how should it be used?"
                                rows={2}
                            />

                            <div className="asset-controls">
                                <label className="asset-field">
                                    <span>Category</span>
                                    <select
                                        className="asset-category"
                                        value={activeAsset.category || 'reference'}
                                        onChange={e => handlePatch(activeAsset.id, { category: e.target.value })}
                                    >
                                        {CATEGORY_OPTIONS.map(([value, label]) => (
                                            <option value={value} key={value}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="asset-brand">
                                    <input
                                        type="checkbox"
                                        checked={!!activeAsset.alwaysInclude}
                                        onChange={e => handlePatch(activeAsset.id, { alwaysInclude: e.target.checked })}
                                    />
                                    <span>Always include</span>
                                </label>
                            </div>
                        </div>
                    )}
                    {activeAsset && (
                        <div className="asset-detail-panel">
                            <div className="asset-detail-preview">
                                {activeAsset.url && activeAsset.exists
                                    ? <img src={activeAsset.url} alt="" />
                                    : <span style={{ background: hashGradient(activeAsset.name) }} />}
                            </div>
                            <div className="asset-detail-meta">
                                <div className="asset-detail-row">
                                    <span>Path</span>
                                    <strong title={activeAsset.path}>{activeAsset.path}</strong>
                                </div>
                                <div className="asset-detail-row">
                                    <span>Details</span>
                                    <strong>
                                        {dimensions?.width && dimensions?.height ? `${dimensions.width}x${dimensions.height}` : 'Dimensions unknown'}
                                        {' / '}
                                        {formatAssetSize(activeAsset.size)}
                                    </strong>
                                </div>
                                <div className="asset-health-list">
                                    {health.map(item => (
                                        <span className={'asset-health ' + item.severity} key={item.code}>{item.label}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="asset-prompt-actions">
                                <button className="mini-action" onClick={() => handleQuickPrompt('logo')}>Use logo as mark</button>
                                <button className="mini-action" onClick={() => handleQuickPrompt('background')}>Use as background</button>
                                <button className="mini-action" onClick={() => handleQuickPrompt('product')}>Product reveal</button>
                                <button className="mini-action" onClick={() => handleQuickPrompt('texture')}>Use texture subtly</button>
                                <button className="mini-action" onClick={handleExtractColors}>Extract colors</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
