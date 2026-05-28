const fs = require('fs');

const CAPTION_STYLE_PRESETS = {
    clean: {
        label: 'Clean subtitles',
        placement: 'lower safe area',
        motion: 'soft fade and small y movement',
        typography: 'high contrast, medium weight, readable on mixed footage',
        emphasis: 'minimal emphasis only'
    },
    kinetic: {
        label: 'Kinetic words',
        placement: 'center-safe stacked phrases',
        motion: 'phrase-level pop, slide, and scale with restrained overshoot',
        typography: 'bold words with clear hierarchy',
        emphasis: 'animate key words without making reading harder'
    },
    karaoke: {
        label: 'Karaoke highlight',
        placement: 'lower third or center-safe line',
        motion: 'stable line with time-based highlight sweep',
        typography: 'large readable text with highlighted active words',
        emphasis: 'active words or phrases change color over exact timing'
    },
    'social shorts': {
        label: 'Social shorts',
        placement: 'center-safe vertical crop friendly',
        motion: 'fast phrase reveals and punchy emphasis',
        typography: 'large bold captions with compact line breaks',
        emphasis: 'highlight strong nouns, verbs, numbers, and names'
    },
    'podcast clips': {
        label: 'Podcast clips',
        placement: 'lower safe area with space for faces',
        motion: 'quiet emphasis and speaker-friendly pacing',
        typography: 'clean subtitle blocks with occasional emphasized terms',
        emphasis: 'do not cover faces or microphones'
    }
};

function parseTimecode(value) {
    const match = String(value || '').trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{3})/);
    if (!match) return 0;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const ms = Number(match[4] || 0);
    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function parseCaptionText(text, format = 'srt') {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const blocks = normalized
        .replace(/^WEBVTT[^\n]*\n+/i, '')
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean);

    const cues = [];
    for (const block of blocks) {
        const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
        const timingIndex = lines.findIndex(line => line.includes('-->'));
        if (timingIndex === -1) continue;
        const [startRaw, endRaw] = lines[timingIndex].split('-->').map(part => part.trim().split(/\s+/)[0]);
        const cueText = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();
        if (!cueText) continue;
        cues.push({
            index: cues.length + 1,
            start: parseTimecode(startRaw),
            end: parseTimecode(endRaw),
            text: cueText,
            format
        });
    }
    return cues;
}

function splitWords(text) {
    return String(text || '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .split(/\s+/)
        .map(word => word.trim())
        .filter(Boolean);
}

function estimateWordTimings(cue = {}) {
    const words = splitWords(cue.text);
    const start = Number(cue.start) || 0;
    const end = Number(cue.end) || start;
    const duration = Math.max(0.001, end - start);
    const unit = duration / Math.max(1, words.length);
    return words.map((word, index) => ({
        word,
        start: Number((start + index * unit).toFixed(3)),
        end: Number((start + (index + 1) * unit).toFixed(3))
    }));
}

function splitCuePhrases(cue = {}, maxWords = 4) {
    const timings = estimateWordTimings(cue);
    const phrases = [];
    for (let i = 0; i < timings.length; i += maxWords) {
        const chunk = timings.slice(i, i + maxWords);
        if (!chunk.length) continue;
        phrases.push({
            text: chunk.map(item => item.word).join(' '),
            start: chunk[0].start,
            end: chunk[chunk.length - 1].end
        });
    }
    return phrases;
}

function analyzeCaptionCues(cues = []) {
    const valid = cues.filter(cue => Number(cue.end) > Number(cue.start));
    const firstStart = valid.length ? Math.min(...valid.map(cue => cue.start)) : 0;
    const lastEnd = valid.length ? Math.max(...valid.map(cue => cue.end)) : 0;
    const words = valid.flatMap(cue => splitWords(cue.text));
    const longestCue = valid.reduce((best, cue) => (
        splitWords(cue.text).length > splitWords(best?.text || '').length ? cue : best
    ), null);
    return {
        cueCount: valid.length,
        wordCount: words.length,
        duration: Number(Math.max(0, lastEnd - firstStart).toFixed(3)),
        averageWordsPerCue: valid.length ? Number((words.length / valid.length).toFixed(1)) : 0,
        longestCueWords: longestCue ? splitWords(longestCue.text).length : 0,
        firstStart,
        lastEnd
    };
}

function buildCaptionPrompt({ cues = [], style = 'clean', width = 1920, height = 1080, fps = 25 } = {}) {
    const limited = cues.slice(0, 120);
    const cueLines = limited.map(cue => `[${cue.start.toFixed(3)}-${cue.end.toFixed(3)}] ${cue.text}`).join('\n');
    const preset = CAPTION_STYLE_PRESETS[style] || CAPTION_STYLE_PRESETS.clean;
    const analysis = analyzeCaptionCues(limited);
    const phraseLines = ['kinetic', 'social shorts'].includes(style)
        ? limited.slice(0, 60).flatMap(cue => splitCuePhrases(cue).map(phrase => `[${phrase.start.toFixed(3)}-${phrase.end.toFixed(3)}] ${phrase.text}`)).join('\n')
        : '';
    const wordLines = style === 'karaoke'
        ? limited.slice(0, 40).flatMap(cue => estimateWordTimings(cue).map(item => `[${item.start.toFixed(3)}-${item.end.toFixed(3)}] ${item.word}`)).join('\n')
        : '';
    return [
        'Create animated captions as a transparent ProRes 4444 overlay.',
        `Style: ${style}.`,
        `Preset: ${preset.label}. Placement: ${preset.placement}.`,
        `Motion: ${preset.motion}. Typography: ${preset.typography}.`,
        `Emphasis: ${preset.emphasis}.`,
        `Canvas: ${width}x${height} at ${fps}fps.`,
        `Transcript stats: ${analysis.cueCount} cues, ${analysis.wordCount} words, ${analysis.duration}s total transcript span.`,
        'Use window.renderFrame(frame, fps) and window.getAnimationDuration().',
        'Respect exact cue timing. Keep captions readable and inside safe margins.',
        'Set html, body, and stage backgrounds to transparent; do not add an opaque full-frame background.',
        'If style is karaoke, highlight the active words over time. If style is kinetic, animate phrases without hurting readability.',
        'Use deterministic frame-based timing; do not rely on requestAnimationFrame, setTimeout, or CSS-only delays.',
        '',
        '<caption_cues>',
        cueLines,
        '</caption_cues>',
        phraseLines ? '\n<caption_phrases>\n' + phraseLines + '\n</caption_phrases>' : '',
        wordLines ? '\n<caption_words>\n' + wordLines + '\n</caption_words>' : ''
    ].filter(Boolean).join('\n');
}

async function handleImportCaptions(_event, payload = {}) {
    let filePath = payload.path;
    if (!filePath) {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
            title: 'Import captions',
            properties: ['openFile'],
            filters: [{ name: 'Captions', extensions: ['srt', 'vtt'] }]
        });
        if (result.canceled || !result.filePaths[0]) return { success: true, cues: [], prompt: '' };
        filePath = result.filePaths[0];
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const format = filePath.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt';
    const cues = parseCaptionText(text, format);
    return { success: true, filePath, format, cues, analysis: analyzeCaptionCues(cues) };
}

function handleParseCaptions(_event, payload = {}) {
    const text = payload.text || '';
    const format = payload.format || (String(text).trim().toUpperCase().startsWith('WEBVTT') ? 'vtt' : 'srt');
    const cues = parseCaptionText(text, format);
    return { success: true, format, cues, analysis: analyzeCaptionCues(cues) };
}

function handleGenerateCaptions(_event, payload = {}) {
    return { success: true, prompt: buildCaptionPrompt(payload), analysis: analyzeCaptionCues(payload.cues || []) };
}

function setupCaptionHandlers(ipcMain) {
    ipcMain.handle('captions:import', handleImportCaptions);
    ipcMain.handle('captions:parse', handleParseCaptions);
    ipcMain.handle('captions:generate', handleGenerateCaptions);
}

module.exports = {
    CAPTION_STYLE_PRESETS,
    analyzeCaptionCues,
    buildCaptionPrompt,
    estimateWordTimings,
    parseCaptionText,
    parseTimecode,
    splitCuePhrases,
    splitWords,
    setupCaptionHandlers
};
