const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  deleteAsset,
  formatSelectedAssets,
  importAssetFiles,
  isAllowedAsset,
  readAssets,
  resolveAssetReferences,
  updateAsset
} = require('../ipc/assets');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-ai-assets-'));
const sourceDir = path.join(tempDir, 'source');
const assetDir = path.join(tempDir, 'assets');
const storePath = path.join(tempDir, 'assets.json');
fs.mkdirSync(sourceDir, { recursive: true });

const logoPath = path.join(sourceDir, 'My Logo.png');
fs.writeFileSync(logoPath, 'not a real png');
fs.writeFileSync(path.join(sourceDir, 'notes.txt'), 'nope');

assert.strictEqual(isAllowedAsset(logoPath), true);
assert.strictEqual(isAllowedAsset(path.join(sourceDir, 'notes.txt')), false);

const imported = importAssetFiles([logoPath, path.join(sourceDir, 'notes.txt')], { storePath, assetDir });
assert.strictEqual(imported.added.length, 1);
assert.strictEqual(readAssets(storePath, assetDir).length, 1);

const asset = imported.added[0];
assert(asset.url.startsWith('file:///'));
assert(fs.existsSync(asset.path));

const updated = updateAsset(asset.id, { notes: 'Gold creator logo', category: 'logo', alwaysInclude: true }, storePath, assetDir);
assert.strictEqual(updated.notes, 'Gold creator logo');
assert.strictEqual(updated.category, 'logo');
assert.strictEqual(updated.alwaysInclude, true);

const prompt = formatSelectedAssets([], { storePath, assetDir });
assert(prompt.includes('<selected_assets>'));
assert(prompt.includes(asset.url));
assert(prompt.includes('Gold creator logo'));
assert(prompt.includes('Category: logo'));

const resolvedHtml = resolveAssetReferences(
  '<img src="My Logo.png"><div style="background-image:url(assets/My%20Logo.png)"></div>',
  [],
  { storePath, assetDir }
);
assert(resolvedHtml.includes(`src="${asset.url}"`));
assert(resolvedHtml.includes(`url("${asset.url}")`));

const inlineHtml = resolveAssetReferences('<img src="My Logo.png">', [], { storePath, assetDir, inlineDataUrls: true });
assert(inlineHtml.includes('src="data:image/png;base64,'));

const deleted = deleteAsset(asset.id, storePath, assetDir);
assert.strictEqual(deleted.success, true);
assert.strictEqual(readAssets(storePath, assetDir).length, 0);

fs.rmSync(tempDir, { recursive: true, force: true });

console.log('assets tests passed');
