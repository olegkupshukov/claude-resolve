import React, { useState } from 'react';

const LOCKS = [
    ['logo', 'Keep logo'],
    ['colors', 'Keep colors'],
    ['layout', 'Keep layout'],
    ['animationOnly', 'Only animation']
];

export default function SidebarVariations({ config, onConfigChange, onPrompt, onUsePrompt }) {
    const [basePrompt, setBasePrompt] = useState('');
    const [variations, setVariations] = useState([]);
    const [status, setStatus] = useState('');
    const generation = config.generation || {};
    const locks = generation.locks || {};
    const count = Number(generation.variationCount || 3);

    async function patchGeneration(patch) {
        await onConfigChange({
            generation: {
                ...generation,
                ...patch,
                locks: { ...locks, ...(patch.locks || {}) }
            }
        });
    }

    async function generate() {
        const prompt = basePrompt.trim();
        if (!prompt) {
            setStatus('Add a base prompt');
            setTimeout(() => setStatus(''), 1800);
            return;
        }
        setStatus('Drafting variations');
        try {
            const result = await window.variationAPI.generate({
                basePrompt: prompt,
                count,
                locks,
                context: {
                    width: config.width,
                    height: config.height,
                    fps: config.fps
                }
            });
            setVariations(result?.variations || []);
            setStatus(result?.variations?.length ? `${result.variations.length} ready` : 'No variations');
        } catch {
            setStatus('Variation failed');
        }
        setTimeout(() => setStatus(''), 2200);
    }

    async function generatePreviews() {
        const prompt = basePrompt.trim();
        if (!prompt) {
            setStatus('Add a base prompt');
            setTimeout(() => setStatus(''), 1800);
            return;
        }
        setStatus('Sending preview request');
        try {
            const result = await window.variationAPI.generateMultiPrompt({
                basePrompt: prompt,
                count,
                locks,
                context: {
                    width: config.width,
                    height: config.height,
                    fps: config.fps
                }
            });
            if (result?.prompt) {
                onPrompt(result.prompt, { displayText: `Generate ${count} variations` });
                setStatus('');
            }
        } catch {
            setStatus('Preview request failed');
            setTimeout(() => setStatus(''), 2200);
        }
    }

    return (
        <div className="sb-section variations-section">
            <div className="sb-title">
                <span>Variations</span>
                <span className="sb-actions">
                    {status && <span className="sync-status">{status}</span>}
                    <button className="sync" onClick={generate}>Draft prompts</button>
                </span>
            </div>

            <textarea
                className="tool-textarea"
                value={basePrompt}
                onChange={e => setBasePrompt(e.target.value)}
                placeholder="Paste or write the base prompt to explore variations..."
                rows={4}
            />

            <div className="variation-controls">
                <label>
                    <span>Count</span>
                    <select value={count} onChange={e => patchGeneration({ variationCount: Number(e.target.value) })}>
                        {[2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <div className="variation-locks" aria-label="Variation locks">
                    {LOCKS.map(([id, label]) => (
                        <button
                            type="button"
                            key={id}
                            className={'lock-chip' + (locks[id] ? ' active' : '')}
                            aria-pressed={!!locks[id]}
                            onClick={() => patchGeneration({ locks: { [id]: !locks[id] } })}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="variation-primary-panel">
                <div>
                    <strong>Generate preview cards</strong>
                    <p>Ask the active provider for {count} complete HTML alternatives in one response. They will appear in chat as separate render cards.</p>
                </div>
                <button className="create-generate" onClick={generatePreviews}>
                    Generate {count} previews
                </button>
            </div>

            <div className="variation-grid">
                {variations.map(variation => (
                    <article className="variation-card" key={variation.id}>
                        <div className="variation-thumb">
                            <span>{variation.title}</span>
                        </div>
                        <div className="variation-card-copy">
                            <strong>{variation.title}</strong>
                            <p>{Object.entries(variation.locks || {}).filter(([, value]) => value).map(([key]) => key).join(', ') || 'No locks'}</p>
                        </div>
                        <button
                            className="mini-action"
                            onClick={() => onUsePrompt(variation.prompt, { displayText: `Variation: ${variation.title}` })}
                        >
                            Use
                        </button>
                    </article>
                ))}
            </div>
        </div>
    );
}
