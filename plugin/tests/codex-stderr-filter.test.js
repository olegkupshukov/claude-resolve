const assert = require('assert');
const { cleanCodexStderr, isNoisyCodexStderr } = require('../ipc/codex-stderr-filter');

assert.strictEqual(isNoisyCodexStderr('failed to load skill C:\\x\\SKILL.md: invalid YAML: mapping values are not allowed'), true);
assert.strictEqual(isNoisyCodexStderr('[features].codex_hooks is deprecated. Use [features].hooks instead.'), true);
assert.strictEqual(isNoisyCodexStderr('fatal: permission denied while rendering overlay'), false);

const clean = cleanCodexStderr([
  'failed to load skill C:\\x\\SKILL.md: invalid YAML',
  'fatal: permission denied while rendering overlay'
].join('\n'));
assert.strictEqual(clean, 'fatal: permission denied while rendering overlay');

console.log('codex-stderr-filter tests passed');
