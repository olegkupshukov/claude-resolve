const DEFAULT_VARIATIONS = [
    {
        id: 'cinematic',
        title: 'Cinematic',
        instruction: 'Increase motion polish, staging depth, and lighting drama while keeping the request readable and practical.'
    },
    {
        id: 'minimal',
        title: 'Minimal',
        instruction: 'Reduce visual noise, simplify layout, and keep typography crisp with restrained motion.'
    },
    {
        id: 'dynamic',
        title: 'Dynamic',
        instruction: 'Make the animation more energetic with stronger timing contrast and a more memorable reveal.'
    }
];

function lockLines(locks = {}) {
    const lines = [];
    if (locks.logo) lines.push('- Keep the selected logo/image asset recognizable and do not redraw it.');
    if (locks.colors) lines.push('- Keep the same color palette and brand color relationships.');
    if (locks.layout) lines.push('- Keep the same composition/layout and only adjust details.');
    if (locks.animationOnly) lines.push('- Only change animation timing/motion; do not change layout, copy, colors, or assets.');
    return lines;
}

function buildVariationPrompt({ basePrompt = '', html = '', variation, locks = {}, context = {} } = {}) {
    const lockText = lockLines(locks);
    return [
        'Create a Resolve AI variation for the following motion graphics request.',
        `Variation direction: ${variation?.title || 'Variation'}.`,
        `Instruction: ${variation?.instruction || 'Create a useful alternate version.'}`,
        '',
        `Original request: ${basePrompt || 'Use the current user request.'}`,
        context.width && context.height ? `Canvas: ${context.width}x${context.height}.` : '',
        context.fps ? `FPS: ${context.fps}.` : '',
        lockText.length ? 'Locks:' : '',
        ...lockText,
        '',
        html ? 'Previous generated HTML context:' : '',
        html ? '```html' : '',
        html || '',
        html ? '```' : '',
        '',
        'Return one complete HTML file using window.renderFrame(frame, fps) and window.getAnimationDuration().'
    ].filter(Boolean).join('\n');
}

function buildVariationSet(payload = {}) {
    const count = Math.max(1, Math.min(6, Number(payload.count || 3)));
    const source = payload.directions?.length ? payload.directions : DEFAULT_VARIATIONS;
    const variations = Array.from({ length: count }, (_, index) => {
        const variation = source[index % source.length];
        return {
            id: `${variation.id || 'variation'}-${index + 1}`,
            title: variation.title || `Variation ${index + 1}`,
            locks: payload.locks || {},
            prompt: buildVariationPrompt({ ...payload, variation })
        };
    });
    return { success: true, variations };
}

function buildMultiVariationPrompt(payload = {}) {
    const count = Math.max(2, Math.min(6, Number(payload.count || 3)));
    const source = payload.directions?.length ? payload.directions : DEFAULT_VARIATIONS;
    const context = payload.context || {};
    const lockText = lockLines(payload.locks || {});
    const directions = Array.from({ length: count }, (_, index) => {
        const variation = source[index % source.length];
        return `${index + 1}. ${variation.title || `Variation ${index + 1}`}: ${variation.instruction || 'Create a useful alternate direction.'}`;
    });

    return [
        `Create exactly ${count} complete Resolve AI motion graphics variations for this request.`,
        '',
        `Original request: ${payload.basePrompt || 'Use the current user request.'}`,
        context.width && context.height ? `Canvas: ${context.width}x${context.height}.` : '',
        context.fps ? `FPS: ${context.fps}.` : '',
        '',
        'Variation directions:',
        ...directions,
        '',
        lockText.length ? 'Locks that apply to every variation:' : '',
        ...lockText,
        '',
        payload.html ? 'Previous generated HTML context:' : '',
        payload.html ? '```html' : '',
        payload.html || '',
        payload.html ? '```' : '',
        '',
        'Output rules:',
        `- Return exactly ${count} fenced \`\`\`html blocks.`,
        '- Each block must be a complete standalone HTML file.',
        '- Each block must include a unique FILE comment/name.',
        '- Every file must implement window.renderFrame(frame, fps) and window.getAnimationDuration().',
        '- Do not return explanations between variations except short labels outside the fenced blocks.',
        '- Preserve selected assets and exact local file URLs when present.',
        '- Keep all examples universal for creators, business, social, education, music, sports, events, or product videos.'
    ].filter(Boolean).join('\n');
}

function setupVariationHandlers(ipcMain) {
    ipcMain.handle('variations:generate', (_event, payload) => buildVariationSet(payload));
    ipcMain.handle('variations:generateMultiPrompt', (_event, payload) => ({
        success: true,
        prompt: buildMultiVariationPrompt(payload)
    }));
}

module.exports = {
    buildMultiVariationPrompt,
    buildVariationPrompt,
    buildVariationSet,
    lockLines,
    setupVariationHandlers
};
