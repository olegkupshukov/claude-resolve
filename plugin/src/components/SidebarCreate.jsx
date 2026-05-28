import React, { useEffect, useMemo, useState } from 'react';
import {
    ASPECT_RATIOS,
    BACKGROUND_MODES,
    CREATE_TYPES,
    STYLE_LEVELS,
    buildCreatePrompt
} from '../data/createWorkflow';

export default function SidebarCreate({ config, onPrompt }) {
    const [type, setType] = useState('title-card');
    const [idea, setIdea] = useState('');
    const [duration, setDuration] = useState(5);
    const [backgroundMode, setBackgroundMode] = useState('transparent');
    const [aspectRatio, setAspectRatio] = useState('timeline');
    const [styleLevel, setStyleLevel] = useState('balanced');
    const [timelineContext, setTimelineContext] = useState(null);

    useEffect(() => {
        let alive = true;
        window.timelineAPI?.getContext?.()
            .then(context => { if (alive) setTimelineContext(context); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    const selectedAssets = (config.selectedAssetIds || []).length;
    const chosen = CREATE_TYPES.find(item => item.id === type) || CREATE_TYPES[0];
    const prompt = useMemo(() => buildCreatePrompt({
        type,
        idea: idea.trim(),
        duration,
        backgroundMode,
        aspectRatio,
        styleLevel,
        selectedAssets,
        config,
        timelineContext
    }), [type, idea, duration, backgroundMode, aspectRatio, styleLevel, selectedAssets, config, timelineContext]);

    function handleGenerate() {
        onPrompt(prompt, { displayText: `${chosen.label}: ${idea.trim() || chosen.help}` });
    }

    return (
        <div className="sb-section create-section">
            <div className="sb-title">
                <span>Create</span>
                <span className="sync-status">{config.width}×{config.height} / {config.fps}fps</span>
            </div>

            <div className="create-type-grid" role="list" aria-label="Create workflow type">
                {CREATE_TYPES.map(item => (
                    <button
                        type="button"
                        role="listitem"
                        key={item.id}
                        className={'create-type' + (type === item.id ? ' active' : '')}
                        aria-pressed={type === item.id}
                        onClick={() => setType(item.id)}
                    >
                        <strong>{item.label}</strong>
                        <span>{item.help}</span>
                    </button>
                ))}
            </div>

            <label className="create-field wide">
                <span>Idea</span>
                <textarea
                    className="tool-textarea"
                    value={idea}
                    onChange={e => setIdea(e.target.value)}
                    placeholder="Example: tech review opener with a glassy product grid and fast text reveal..."
                    rows={4}
                />
            </label>

            <div className="create-controls">
                <label className="create-field">
                    <span>Duration</span>
                    <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                        {[2, 3, 4, 5, 6, 8, 10].map(value => <option key={value} value={value}>{value}s</option>)}
                    </select>
                </label>
                <label className="create-field">
                    <span>Background</span>
                    <select value={backgroundMode} onChange={e => setBackgroundMode(e.target.value)}>
                        {BACKGROUND_MODES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                </label>
                <label className="create-field">
                    <span>Aspect</span>
                    <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                        {ASPECT_RATIOS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                </label>
                <label className="create-field">
                    <span>Style</span>
                    <select value={styleLevel} onChange={e => setStyleLevel(e.target.value)}>
                        {STYLE_LEVELS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                </label>
            </div>

            <div className="generation-brief">
                <div>
                    <span>Generation brief</span>
                    <strong>{chosen.label} / {duration}s / {backgroundMode} / {styleLevel}</strong>
                </div>
                <p>{idea.trim() || chosen.help}</p>
                <small>
                    {selectedAssets ? `${selectedAssets} attached asset${selectedAssets === 1 ? '' : 's'}` : 'No attached assets'}
                    {timelineContext?.selectedClips?.length ? ` / ${timelineContext.selectedClips.length} selected clip${timelineContext.selectedClips.length === 1 ? '' : 's'}` : ''}
                </small>
            </div>

            <button className="create-generate" onClick={handleGenerate}>
                Generate {chosen.label}
            </button>
        </div>
    );
}
