const assert = require('assert');
const { buildMultiVariationPrompt, buildVariationPrompt, buildVariationSet, lockLines } = require('../ipc/variations');

const locks = { logo: true, colors: true, layout: false, animationOnly: true };
const lines = lockLines(locks);
assert(lines.some(line => line.includes('logo')));
assert(lines.some(line => line.includes('Only change animation')));

const prompt = buildVariationPrompt({
  basePrompt: 'Create a product launch title.',
  variation: { title: 'Minimal', instruction: 'Simplify it.' },
  locks,
  context: { width: 1920, height: 1080, fps: 25 },
  html: '<html></html>'
});

assert(prompt.includes('Create a product launch title.'));
assert(prompt.includes('1920x1080'));
assert(prompt.includes('Previous generated HTML'));
assert(prompt.includes('Keep the same color palette'));

const set = buildVariationSet({ basePrompt: 'Title card', count: 3, locks });
assert.strictEqual(set.success, true);
assert.strictEqual(set.variations.length, 3);
assert(set.variations[0].prompt.includes('Title card'));

const multi = buildMultiVariationPrompt({
  basePrompt: 'Creator intro',
  count: 3,
  locks,
  context: { width: 1920, height: 1080, fps: 25 }
});
assert(multi.includes('Create exactly 3 complete'));
assert(multi.includes('Return exactly 3 fenced'));
assert(multi.includes('unique FILE'));
assert(multi.includes('Keep the selected logo'));

console.log('variations tests passed');
