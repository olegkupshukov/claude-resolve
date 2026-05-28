function formatWarnings(warnings = []) {
    return warnings.map(warning => {
        if (typeof warning === 'string') return `- ${warning}`;
        return `- ${warning.code || 'warning'}: ${warning.message || ''}`;
    }).join('\n');
}

function canRepairRender(repairCount) {
    return Number(repairCount || 0) < 2;
}

function buildRepairPrompt(payload = {}) {
    const repairCount = Number(payload.repairCount || 0);
    return [
        'Fix this Resolve AI render. Return exactly one complete replacement ```html code block.',
        'Preserve the original visual intent, selected assets, dimensions, FPS, and the overlay contract.',
        'Do not explain the fix outside the required short response style.',
        `Repair attempt: ${repairCount + 1} of 2.`,
        '',
        '<original_request>',
        payload.originalPrompt || '',
        '</original_request>',
        '',
        '<render_error>',
        payload.error || 'Unknown render error',
        '</render_error>',
        '',
        '<validation_warnings>',
        formatWarnings(payload.validationWarnings || []),
        '</validation_warnings>',
        '',
        '<previous_html>',
        '```html',
        payload.html || '',
        '```',
        '</previous_html>'
    ].join('\n');
}

module.exports = {
    buildRepairPrompt,
    canRepairRender
};
