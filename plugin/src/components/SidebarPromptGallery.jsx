import React, { useEffect, useMemo, useState } from 'react';

function promptFromTemplate(item, mode) {
    if (mode === 'template') {
        return [
            'Use this Resolve AI gallery template as the starting point.',
            '',
            `Template: ${item.title || item.name}`,
            `Category: ${item.category}`,
            '',
            `Original prompt: ${item.prompt}`,
            '',
            'Template HTML:',
            '```html',
            item.html || '',
            '```',
            '',
            'Return one complete replacement HTML file. Keep the same output contract.'
        ].join('\n');
    }
    if (mode === 'remix') {
        return `${item.prompt}\n\nRemix this with a fresh visual direction while keeping it useful for ${item.category} videos.`;
    }
    return item.prompt;
}

export default function SidebarPromptGallery({ config, onConfigChange, onPrompt }) {
    const [items, setItems] = useState([]);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [packUrl, setPackUrl] = useState('');
    const [status, setStatus] = useState('');
    const favorites = config?.gallery?.favorites || [];
    const recentIds = config?.gallery?.recentIds || [];

    async function refresh() {
        if (!window.galleryAPI) return;
        setItems(await window.galleryAPI.list());
    }

    useEffect(() => { refresh(); }, []);

    async function handleImportPack() {
        setStatus('Importing');
        const result = await window.galleryAPI.importPack();
        setStatus(result?.success && !result?.canceled ? 'Imported' : 'No import');
        await refresh();
        setTimeout(() => setStatus(''), 2200);
    }

    async function handleBuildShowcase() {
        setStatus('Building');
        const result = await window.showcaseAPI.build({
            items: items.map(item => ({
                title: item.title,
                category: item.category,
                prompt: item.prompt,
                thumbnail: item.preview,
                tags: item.tags
            }))
        });
        setStatus(result?.success ? `Showcase ${result.count}` : 'Failed');
        setTimeout(() => setStatus(''), 2600);
    }

    async function handleInstallFromUrl() {
        const url = packUrl.trim();
        if (!url) return;
        setStatus('Installing');
        const result = await window.galleryAPI.installPackFromUrl(url);
        setStatus(result?.success ? 'Installed' : (result?.error || 'Install failed'));
        if (result?.success) {
            setPackUrl('');
            await refresh();
        }
        setTimeout(() => setStatus(''), 3200);
    }

    const categories = useMemo(() => {
        return ['all', 'favorites', 'recent', ...Array.from(new Set(items.map(item => item.category).filter(Boolean))).sort()];
    }, [items]);

    async function rememberUse(item) {
        const key = `${item.packId}:${item.id}`;
        const nextRecent = [key, ...recentIds.filter(id => id !== key)].slice(0, 12);
        await onConfigChange?.({ gallery: { ...(config.gallery || {}), recentIds: nextRecent } });
    }

    async function toggleFavorite(item) {
        const key = `${item.packId}:${item.id}`;
        const nextFavorites = favorites.includes(key)
            ? favorites.filter(id => id !== key)
            : [...favorites, key];
        await onConfigChange?.({ gallery: { ...(config.gallery || {}), favorites: nextFavorites } });
    }

    function useGalleryItem(item, mode) {
        rememberUse(item);
        const label = mode === 'template'
            ? `Use template: ${item.title}`
            : mode === 'remix'
                ? `Remix: ${item.title}`
                : item.title;
        onPrompt(promptFromTemplate(item, mode), { displayText: label });
    }

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        return items.filter(item => [
            item.title,
            item.category,
            item.prompt,
            ...(item.tags || [])
        ].filter(Boolean).join(' ').toLowerCase().includes(q))
            .filter(item => {
                const key = `${item.packId}:${item.id}`;
                if (category === 'favorites') return favorites.includes(key);
                if (category === 'recent') return recentIds.includes(key);
                if (category === 'all') return true;
                return item.category === category;
            });
    }, [items, query, category, favorites, recentIds]);

    return (
        <div className="sb-section gallery-section">
            <div className="sb-title">
                <span>Prompt Gallery</span>
                <span className="sb-actions">
                    {status && <span className="sync-status">{status}</span>}
                    <button className="sync" onClick={handleImportPack}>Import</button>
                    <button className="sync" onClick={handleBuildShowcase}>Showcase</button>
                </span>
            </div>
            <input className="sb-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search gallery" />
            <div className="gallery-filter-strip" role="tablist" aria-label="Gallery filters">
                {categories.map(cat => (
                    <button
                        type="button"
                        key={cat}
                        className={'gallery-filter' + (category === cat ? ' active' : '')}
                        aria-selected={category === cat}
                        onClick={() => setCategory(cat)}
                    >
                        {cat === 'all' ? 'All' : cat === 'favorites' ? 'Favorites' : cat === 'recent' ? 'Recent' : cat}
                    </button>
                ))}
            </div>
            <div className="gallery-url-import">
                <input
                    value={packUrl}
                    onChange={e => setPackUrl(e.target.value)}
                    placeholder="GitHub raw template-pack.json URL"
                />
                <button className="mini-action" disabled={!packUrl.trim()} onClick={handleInstallFromUrl}>Install URL</button>
            </div>
            <div className="gallery-list">
                {filtered.map(item => (
                    <div className="gallery-row" key={`${item.packId}-${item.id}`}>
                        <div className="template-thumb gallery-thumb" />
                        <div className="template-meta">
                            <div className="template-name-row">
                                <div className="template-name">{item.title || item.name}</div>
                                <button
                                    className={'favorite-btn' + (favorites.includes(`${item.packId}:${item.id}`) ? ' active' : '')}
                                    onClick={() => toggleFavorite(item)}
                                    aria-label="Toggle favorite"
                                    title="Toggle favorite"
                                >
                                    ★
                                </button>
                            </div>
                            <div className="template-sub">{item.category} · {(item.tags || []).slice(0, 2).join(', ')}</div>
                            <div className="render-actions">
                                <button className="mini-action" onClick={() => useGalleryItem(item, 'prompt')}>Use Prompt</button>
                                <button className="mini-action" onClick={() => useGalleryItem(item, 'template')}>Use Template</button>
                                <button className="mini-action" onClick={() => useGalleryItem(item, 'remix')}>Remix</button>
                            </div>
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && <div className="sb-empty">No gallery items match this filter</div>}
            </div>
        </div>
    );
}
