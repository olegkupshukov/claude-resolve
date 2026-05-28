const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  extractColorsFromAsset,
  getAssetHealth,
  inspectAsset,
  inspectImageFile,
  readAssets,
  writeAssets
} = require('../ipc/assets');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-ai-asset-health-'));
const assetDir = path.join(tempDir, 'assets');
const storePath = path.join(tempDir, 'assets.json');
fs.mkdirSync(assetDir, { recursive: true });

const png = Buffer.alloc(33);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
png.writeUInt32BE(13, 8);
png.write('IHDR', 12);
png.writeUInt32BE(12, 16);
png.writeUInt32BE(8, 20);
png[24] = 8;
png[25] = 6;
fs.writeFileSync(path.join(assetDir, 'logo.png'), png);

writeAssets([
  { id: 'logo', name: 'Logo', fileName: 'logo.png', ext: '.png', category: 'logo' },
  { id: 'missing', name: 'Missing', fileName: 'missing.png', ext: '.png', category: 'reference' }
], storePath);

const assets = readAssets(storePath, assetDir);
assert.strictEqual(assets.length, 2);
assert.strictEqual(assets.find(asset => asset.id === 'missing').exists, false);

const dimensions = inspectImageFile(path.join(assetDir, 'logo.png'));
assert.strictEqual(dimensions.width, 12);
assert.strictEqual(dimensions.height, 8);
assert.strictEqual(dimensions.hasAlpha, true);

const inspected = inspectAsset('logo', { storePath, assetDir, maxImportSizeMb: 1 });
assert.strictEqual(inspected.success, true);
assert(inspected.asset.health.some(item => item.code === 'transparent-png'));

const missingHealth = getAssetHealth(assets.find(asset => asset.id === 'missing'), { maxImportSizeMb: 1 });
assert(missingHealth.health.some(item => item.code === 'missing'));

const colors = extractColorsFromAsset('logo', { storePath, assetDir });
assert.strictEqual(colors.success, true);
assert.strictEqual(colors.colors.length, 5);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('asset health tests passed');
