const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  flattenGalleryItems,
  importTemplatePackPayload,
  loadGalleryItems,
  validateTemplatePack
} = require('../ipc/template-packs');

const validHtml = '<!DOCTYPE html><html><body><script>window.getAnimationDuration = () => 4; window.renderFrame = () => {};</script></body></html>';
const pack = {
  id: 'creator-essentials',
  name: 'Creator Essentials',
  templates: [{
    id: 'creator-title',
    name: 'Creator Title',
    title: 'Creator Title',
    category: 'creator',
    tags: ['title', 'creator'],
    prompt: 'Create a creator title card.',
    html: validHtml,
    thumbnail: 'builtin://creator-title',
    preview: 'builtin://creator-title',
    fps: 25,
    width: 1920,
    height: 1080,
    createdBy: 'Resolve AI',
    recommendedProvider: 'auto'
  }]
};

assert.strictEqual(validateTemplatePack(pack).ok, true);
assert.strictEqual(validateTemplatePack({ ...pack, templates: [{ ...pack.templates[0], html: '<script src="https://example.com/x.js"></script>' }] }).ok, false);
assert.strictEqual(flattenGalleryItems([pack]).length, 1);
assert.strictEqual(flattenGalleryItems([pack])[0].packName, 'Creator Essentials');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-ai-packs-'));
const storePath = path.join(tempDir, 'imported.json');
const imported = importTemplatePackPayload(pack, storePath);
assert.strictEqual(imported.success, true);
assert.strictEqual(loadGalleryItems({ importedStorePath: storePath, builtinPath: path.join(tempDir, 'missing.json') }).length, 1);
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('template-packs tests passed');
