export const CREATE_TYPES = [
    {
        id: 'title-card',
        label: 'Title',
        help: 'Full-frame opener, chapter card, or segment title.',
        prompt: 'Create a polished title card for the current video.'
    },
    {
        id: 'lower-third',
        label: 'Lower Third',
        help: 'Name/title/location overlay with alpha.',
        prompt: 'Create a clean transparent lower third overlay.'
    },
    {
        id: 'transition',
        label: 'Transition',
        help: 'Short bridge at the playhead.',
        prompt: 'Create a short transparent transition overlay.'
    },
    {
        id: 'captions',
        label: 'Captions',
        help: 'Animated caption look or reusable caption system.',
        prompt: 'Create an animated transparent caption overlay style.'
    },
    {
        id: 'logo-reveal',
        label: 'Logo Reveal',
        help: 'Brand or channel mark reveal.',
        prompt: 'Create a refined logo reveal animation.'
    },
    {
        id: 'product-reveal',
        label: 'Product Reveal',
        help: 'Product shot, app, object, or feature reveal.',
        prompt: 'Create a premium product reveal motion graphic.'
    }
];

export const BACKGROUND_MODES = [
    ['transparent', 'Transparent overlay'],
    ['full-frame', 'Full-frame background'],
    ['asset', 'Use attached asset'],
    ['auto', 'Auto']
];

export const ASPECT_RATIOS = [
    ['timeline', 'Timeline settings'],
    ['16:9', '16:9 horizontal'],
    ['9:16', '9:16 vertical'],
    ['1:1', '1:1 square'],
    ['4:5', '4:5 social']
];

export const STYLE_LEVELS = [
    ['clean', 'Clean'],
    ['balanced', 'Balanced'],
    ['cinematic', 'Cinematic'],
    ['bold', 'Bold']
];

export function buildCreatePrompt({ type, idea, duration, backgroundMode, aspectRatio, styleLevel, selectedAssets, config, timelineContext }) {
    const chosen = CREATE_TYPES.find(item => item.id === type) || CREATE_TYPES[0];
    const fps = config?.fps || 25;
    const width = config?.width || 1920;
    const height = config?.height || 1080;
    const assetText = selectedAssets > 0
        ? `Use the ${selectedAssets} attached local asset${selectedAssets === 1 ? '' : 's'} when relevant. Keep referenced assets recognizable and use exact file URLs if provided.`
        : 'No assets are attached.';
    const clipLines = (timelineContext?.selectedClips || []).map(clip => [
        clip.name || clip.fileName || 'Selected clip',
        clip.mediaType ? `type ${clip.mediaType}` : null,
        clip.startFrame !== null && clip.endFrame !== null ? `frames ${clip.startFrame}-${clip.endFrame}` : null
    ].filter(Boolean).join(' / '));

    return [
        chosen.prompt,
        idea ? `Creative brief: ${idea}` : 'Creative brief: make a useful universal creator motion graphic.',
        `Duration: ${duration || 5} seconds.`,
        `Background mode: ${backgroundMode}.`,
        `Aspect ratio: ${aspectRatio}. Canvas: ${width}x${height} at ${fps}fps.`,
        timelineContext?.timelineName ? `Timeline: ${timelineContext.timelineName}.` : 'Timeline context unavailable.',
        timelineContext?.currentTimecode ? `Playhead: ${timelineContext.currentTimecode}.` : 'Playhead unavailable.',
        clipLines.length ? `Selected clip context:\n${clipLines.join('\n')}` : 'Selected clip context unavailable.',
        `Style intensity: ${styleLevel}.`,
        assetText,
        'Keep the output practical for DaVinci Resolve editors and universal creator/business/social/video workflows.',
        'Use window.renderFrame(frame, fps) and window.getAnimationDuration().',
        backgroundMode === 'transparent'
            ? 'Set html, body, and any full-stage backgrounds to transparent. Do not add opaque full-frame rectangles.'
            : 'Use a coherent full-frame visual system if a background is needed.',
        'Return one complete HTML file.'
    ].join('\n');
}
