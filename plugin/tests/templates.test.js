const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  deleteTemplateById,
  readTemplates,
  saveTemplatePayload
} = require('../ipc/templates');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-ai-templates-'));
const storePath = path.join(tempDir, 'templates.json');

const saved = saveTemplatePayload({
  name: 'Title Card',
  prompt: 'make a title card',
  html: '<html></html>',
  provider: 'codex',
  model: 'gpt-5.2',
  width: 1920,
  height: 1080,
  fps: 25
}, storePath);

assert(saved.id);
assert.strictEqual(readTemplates(storePath).length, 1);
assert.strictEqual(readTemplates(storePath)[0].name, 'Title Card');

deleteTemplateById(saved.id, storePath);
assert.strictEqual(readTemplates(storePath).length, 0);

fs.rmSync(tempDir, { recursive: true, force: true });

console.log('templates tests passed');
