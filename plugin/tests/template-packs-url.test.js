const assert = require('assert');
const { validateTemplatePackUrl } = require('../ipc/template-packs');

assert.strictEqual(validateTemplatePackUrl('https://raw.githubusercontent.com/user/repo/main/pack.json').ok, true);
assert.strictEqual(validateTemplatePackUrl('http://localhost:3000/pack.json').ok, true);
assert.strictEqual(validateTemplatePackUrl('file:///tmp/pack.json').ok, false);
assert.strictEqual(validateTemplatePackUrl('https://example.com/pack.txt').ok, false);
assert.strictEqual(validateTemplatePackUrl('not a url').ok, false);

console.log('template pack URL tests passed');
