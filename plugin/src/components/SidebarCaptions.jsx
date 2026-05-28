import React, { useState } from 'react';

const CAPTION_STYLES = [
    ['clean', 'Clean', 'Readable subtitles for general edits.'],
    ['kinetic', 'Kinetic', 'Phrase motion with strong emphasis.'],
    ['karaoke', 'Karaoke', 'Timed word or phrase highlighting.'],
    ['social shorts', 'Social', 'Large captions for short-form clips.'],
    ['podcast clips', 'Podcast', 'Lower captions with space for faces.']
];

function summarizeCues(cues) {
    if (!cues.length) return { cueCount: 0, wordCount: 0, duration: 0, averageWordsPerCue: 0 };
    const first = Math.min(...cues.map(cue => cue.start));
    const last = Math.max(...cues.map(cue => cue.end));
    const wordCount = cues.reduce((sum, cue) => sum + String(cue.text || '').split(/\s+/).filter(Boolean).length, 0);
    return {
        cueCount: cues.length,
        wordCount,
        duration: Math.max(0, last - first),
        averageWordsPerCue: cues.length ? wordCount / cues.length : 0
    };
}

export default function SidebarCaptions({ config, onConfigChange, onPrompt }) {
    const [cues, setCues] = useState([]);
    const [style, setStyle] = useState(config?.captions?.defaultStyle || 'clean');
    const [rawText, setRawText] = useState('');
    const [status, setStatus] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const stats = analysis || summarizeCues(cues);

    async function handleImport() {
        setStatus('Importing');
        const result = await window.captionAPI.import();
        const nextCues = result?.cues || [];
        setCues(nextCues);
        setAnalysis(result?.analysis || summarizeCues(nextCues));
        setStatus(nextCues.length ? `${nextCues.length} cues` : 'No captions');
        setTimeout(() => setStatus(''), 2400);
    }

    async function handleParseText() {
        const text = rawText.trim();
        if (!text) return;
        setStatus('Parsing');
        const result = await window.captionAPI.parse({ text });
        const nextCues = result?.cues || [];
        setCues(nextCues);
        setAnalysis(result?.analysis || summarizeCues(nextCues));
        setStatus(nextCues.length ? `${nextCues.length} cues` : 'No cues');
        setTimeout(() => setStatus(''), 2200);
    }

    async function handleStyleChange(nextStyle) {
        setStyle(nextStyle);
        await onConfigChange?.({ captions: { defaultStyle: nextStyle } });
    }

    async function handleGenerate() {
        if (cues.length === 0) return;
        const result = await window.captionAPI.generate({
            cues,
            style,
            width: config.width,
            height: config.height,
            fps: config.fps
        });
        if (result?.prompt) {
            onPrompt(result.prompt, { displayText: `Captions: ${style}` });
        }
    }

    return (
        <div className="sb-section captions-section">
            <div className="sb-title">
                <span>Captions</span>
                <span className="sb-actions">
                    {status && <span className="sync-status">{status}</span>}
                    <button className="sync" onClick={handleImport}>Import</button>
                </span>
            </div>

            <div className="caption-controls">
                <button className="mini-action" disabled={cues.length === 0} onClick={handleGenerate}>Generate</button>
                <span>{cues.length ? `${cues.length} cues loaded` : 'SRT/VTT local only'}</span>
            </div>

            <div className="caption-style-grid" role="list" aria-label="Caption styles">
                {CAPTION_STYLES.map(([value, label, help]) => (
                    <button
                        type="button"
                        role="listitem"
                        key={value}
                        className={'caption-style-card' + (style === value ? ' active' : '')}
                        aria-pressed={style === value}
                        onClick={() => handleStyleChange(value)}
                    >
                        <strong>{label}</strong>
                        <span>{help}</span>
                    </button>
                ))}
            </div>

            <textarea
                className="tool-textarea caption-paste"
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="Paste SRT or VTT here to preview before generating..."
                rows={4}
            />
            <button className="mini-action caption-parse" disabled={!rawText.trim()} onClick={handleParseText}>Parse pasted captions</button>

            {cues.length > 0 ? (
                <>
                    <div className="caption-stats-grid">
                        <div><span>Cues</span><strong>{stats.cueCount}</strong></div>
                        <div><span>Words</span><strong>{stats.wordCount}</strong></div>
                        <div><span>Span</span><strong>{stats.duration.toFixed(1)}s</strong></div>
                        <div><span>Avg</span><strong>{stats.averageWordsPerCue.toFixed(1)} w/cue</strong></div>
                    </div>
                    <div className="caption-cue-list">
                        {cues.slice(0, 12).map(cue => (
                            <div className="caption-cue" key={cue.index}>
                                <span>{cue.start.toFixed(2)} - {cue.end.toFixed(2)}</span>
                                <strong>{cue.text}</strong>
                                <small>{Math.max(0, cue.end - cue.start).toFixed(2)}s / {String(cue.text || '').split(/\s+/).filter(Boolean).length} words</small>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="caption-empty-workflow">
                    <strong>Caption Studio</strong>
                    <p>Import or paste SRT/VTT, choose a style, then generate a transparent ProRes 4444 overlay prompt.</p>
                </div>
            )}
        </div>
    );
}
