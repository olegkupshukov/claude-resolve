const assert = require('assert');
const { buildRepairPrompt, canRepairRender } = require('../ipc/repair');

const prompt = buildRepairPrompt({
  originalPrompt: 'Create a title card',
  html: '<html></html>',
  error: 'getAnimationDuration returned invalid value',
  validationWarnings: [{ code: 'missing-duration', message: 'Missing getAnimationDuration()', severity: 'error' }],
  repairCount: 1
});

assert(prompt.includes('Fix this Resolve AI render'));
assert(prompt.includes('Create a title card'));
assert(prompt.includes('missing-duration'));
assert(prompt.includes('getAnimationDuration returned invalid value'));
assert(prompt.includes('```html'));
assert.strictEqual(canRepairRender(0), true);
assert.strictEqual(canRepairRender(1), true);
assert.strictEqual(canRepairRender(2), false);

console.log('repair tests passed');
