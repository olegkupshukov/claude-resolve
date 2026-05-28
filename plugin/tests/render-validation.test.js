const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { validateOverlayHtml } = require('../ipc/render-validation');

function codes(result) {
  return result.warnings.map(warning => warning.code);
}

{
  const result = validateOverlayHtml({
    html: '<html><script>window.renderFrame = () => {}</script></html>',
    config: { width: 1920, height: 1080 }
  });
  assert(codes(result).includes('missing-duration'));
  assert.strictEqual(result.ok, false);
}

{
  const result = validateOverlayHtml({
    html: '<html><script>window.getAnimationDuration = () => 5</script></html>',
    config: { width: 1920, height: 1080 }
  });
  assert(codes(result).includes('missing-render-mode'));
  assert.strictEqual(result.ok, false);
}

{
  const result = validateOverlayHtml({
    html: '<style>html, body { width: 1280px; height: 720px; }</style><script>window.getAnimationDuration = () => 5; window.renderFrame = () => {};</script>',
    config: { width: 1920, height: 1080 }
  });
  assert(codes(result).includes('width-mismatch'));
  assert(codes(result).includes('height-mismatch'));
}

{
  const result = validateOverlayHtml({
    prompt: 'transparent lower third',
    html: '<style>body { background: #071914; }</style><script>window.getAnimationDuration = () => 5; window.renderFrame = () => {};</script>',
    config: { width: 1920, height: 1080 }
  });
  assert(codes(result).includes('transparent-mismatch'));
  assert(codes(result).includes('transparent-base-missing'));
}

{
  const result = validateOverlayHtml({
    prompt: 'transparent background title overlay',
    html: '<style>html, body { background: transparent; } #stage { background: #101010; }</style><script>const DURATION = 5; window.getAnimationDuration = () => DURATION; window.renderFrame = () => {};</script>',
    config: { width: 1920, height: 1080 }
  });
  assert(codes(result).includes('transparent-mismatch'));
}

{
  const result = validateOverlayHtml({
    html: '<script>const DURATION = 5; window.getAnimationDuration = () => DURATION; window.renderFrame = () => {};</script>',
    config: { width: 1920, height: 1080 }
  });
  assert.strictEqual(result.duration, 5);
  assert(!codes(result).includes('missing-duration'));
}

{
  const result = validateOverlayHtml({
    prompt: 'deep green background with a transparent-safe final hold',
    html: '<style>body { background: #071914; }</style><script>const DURATION = 5; window.getAnimationDuration = () => DURATION; window.renderFrame = () => {};</script>',
    config: { width: 1920, height: 1080 }
  });
  assert(!codes(result).includes('transparent-mismatch'));
}

{
  const missingUrl = pathToFileURL(path.join(os.tmpdir(), 'resolve-ai-missing-asset.png')).href;
  const result = validateOverlayHtml({
    html: `<img src="${missingUrl}"><script>const DURATION = 5; window.getAnimationDuration = () => DURATION; window.renderFrame = () => {};</script>`,
    config: { width: 1920, height: 1080 }
  });
  assert(codes(result).includes('missing-asset'));
}

{
  const tempFile = path.join(os.tmpdir(), `resolve-ai-existing-${Date.now()}.png`);
  fs.writeFileSync(tempFile, 'fake');
  const result = validateOverlayHtml({
    html: `<img src="${pathToFileURL(tempFile).href}"><script>const DURATION = 5; window.getAnimationDuration = () => DURATION; window.renderFrame = () => {};</script>`,
    config: { width: 1920, height: 1080 }
  });
  fs.rmSync(tempFile, { force: true });
  assert(!codes(result).includes('missing-asset'));
}

console.log('render-validation tests passed');
