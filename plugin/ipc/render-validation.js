const fs = require('fs');
const { fileURLToPath } = require('url');

function includesAny(text, terms) {
  const lower = String(text || '').toLowerCase();
  return terms.some(term => lower.includes(term));
}

function addWarning(warnings, code, message, severity = 'warning') {
  warnings.push({ code, message, severity });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveNumericIdentifier(html, identifier) {
  const pattern = new RegExp(`(?:const|let|var)\\s+${escapeRegExp(identifier)}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i');
  const match = String(html || '').match(pattern);
  return match ? Number(match[1]) : null;
}

function hasDurationFunction(html) {
  return /getAnimationDuration\s*=\s*|function\s+getAnimationDuration\s*\(/i.test(String(html || ''));
}

function parseDuration(html) {
  const patterns = [
    /getAnimationDuration\s*=\s*\(\s*\)\s*=>\s*([0-9.]+)/i,
    /getAnimationDuration\s*=\s*function\s*\([^)]*\)\s*{[^}]*return\s+([0-9.]+)/is,
    /function\s+getAnimationDuration\s*\([^)]*\)\s*{[^}]*return\s+([0-9.]+)/is
  ];

  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match) return Number(match[1]);
  }

  const identifierPatterns = [
    /getAnimationDuration\s*=\s*\(\s*\)\s*=>\s*([A-Za-z_$][\w$]*)/i,
    /getAnimationDuration\s*=\s*function\s*\([^)]*\)\s*{[^}]*return\s+([A-Za-z_$][\w$]*)/is,
    /function\s+getAnimationDuration\s*\([^)]*\)\s*{[^}]*return\s+([A-Za-z_$][\w$]*)/is
  ];

  for (const pattern of identifierPatterns) {
    const match = String(html || '').match(pattern);
    if (!match) continue;
    const resolved = resolveNumericIdentifier(html, match[1]);
    if (resolved !== null) return resolved;
  }

  return null;
}

function getDeclaredDimension(html, property) {
  const scopedPatterns = [
    new RegExp(`#stage\\s*{[^}]*${property}\\s*:\\s*([0-9]+)px`, 'i'),
    new RegExp(`html\\s*,\\s*body\\s*{[^}]*${property}\\s*:\\s*([0-9]+)px`, 'i'),
    new RegExp(`body\\s*{[^}]*${property}\\s*:\\s*([0-9]+)px`, 'i')
  ];

  for (const pattern of scopedPatterns) {
    const match = String(html || '').match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

function wantsTransparency(prompt, html) {
  const lowerPrompt = String(prompt || '').toLowerCase();
  if (includesAny(lowerPrompt, ['transparent-safe', 'transparency-safe', 'alpha-safe'])) return false;
  return includesAny(lowerPrompt, ['transparent background', 'transparent lower third', 'alpha channel', 'with alpha', 'lower third', 'caption overlay'])
    || includesAny(html, ['transparent background', 'alpha channel']);
}

function hasOpaqueBodyBackground(html) {
  return hasOpaqueSelectorBackground(html, ['html\\s*,\\s*body', 'body']);
}

function isTransparentBackgroundValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized === 'transparent'
    || normalized === 'none'
    || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(normalized)
    || /#(?:0000|[0-9a-f]{6}00|[0-9a-f]{8})$/i.test(normalized)
  );
}

function hasOpaqueSelectorBackground(html, selectors) {
  const text = String(html || '');
  for (const selector of selectors) {
    const blockMatch = text.match(new RegExp(`${selector}\\s*{([^}]*)}`, 'i'));
    if (!blockMatch) continue;
    const backgroundMatch = blockMatch[1].match(/background(?:-color)?\s*:\s*([^;]+);?/i);
    if (!backgroundMatch) continue;
    if (!isTransparentBackgroundValue(backgroundMatch[1])) return true;
  }
  return false;
}

function hasOpaqueStageBackground(html) {
  const selectors = ['#stage', '\\.stage', '#root', '\\.overlay', '\\.canvas'];
  return hasOpaqueSelectorBackground(html, selectors);
}

function hasTransparentBase(html) {
  const bodyMatch = String(html || '').match(/(?:html\s*,\s*body|body)\s*{([^}]*)}/i);
  if (!bodyMatch) return false;
  const backgroundMatch = bodyMatch[1].match(/background(?:-color)?\s*:\s*([^;]+);?/i);
  if (!backgroundMatch) return false;
  return isTransparentBackgroundValue(backgroundMatch[1]);
}

function findMissingFileAssets(html) {
  const missing = [];
  const pattern = /file:\/\/[^'")\s<>]+/g;
  const matches = String(html || '').match(pattern) || [];
  for (const rawUrl of matches) {
    try {
      const filePath = fileURLToPath(rawUrl);
      if (!fs.existsSync(filePath)) missing.push(rawUrl);
    } catch {
      missing.push(rawUrl);
    }
  }
  return [...new Set(missing)];
}

function validateOverlayHtml(input = {}) {
  const html = String(input.html || '');
  const prompt = String(input.prompt || '');
  const config = input.config || {};
  const warnings = [];

  if (!html.trim()) {
    addWarning(warnings, 'empty-html', 'No HTML was generated.', 'error');
    return { ok: false, warnings };
  }

  const duration = parseDuration(html);
  if (!hasDurationFunction(html)) {
    addWarning(warnings, 'missing-duration', 'Missing getAnimationDuration(), so render length may be wrong.', 'error');
  } else if (duration === null || Number.isNaN(duration)) {
    addWarning(warnings, 'duration-unresolved', 'Could not statically read getAnimationDuration(); the renderer will evaluate it directly.');
  } else if (duration <= 0) {
    addWarning(warnings, 'bad-duration', 'Animation duration must be greater than 0 seconds.', 'error');
  } else if (duration > 30) {
    addWarning(warnings, 'long-duration', `Animation duration is ${duration}s; confirm this was intentional.`);
  }

  const hasRenderFrame = /renderFrame\s*=\s*|function\s+renderFrame\s*\(/i.test(html);
  const hasReactMode = /ReactDOM\.createRoot|createRoot\s*\(/i.test(html);
  if (!hasRenderFrame && !hasReactMode) {
    addWarning(warnings, 'missing-render-mode', 'Missing renderFrame() or React render mode. Preview/render may be static or fail.', 'error');
  }

  const expectedWidth = Number(config.width);
  const expectedHeight = Number(config.height);
  const declaredWidth = getDeclaredDimension(html, 'width');
  const declaredHeight = getDeclaredDimension(html, 'height');
  if (expectedWidth && declaredWidth && declaredWidth !== expectedWidth) {
    addWarning(warnings, 'width-mismatch', `HTML width is ${declaredWidth}px but settings are ${expectedWidth}px.`);
  }
  if (expectedHeight && declaredHeight && declaredHeight !== expectedHeight) {
    addWarning(warnings, 'height-mismatch', `HTML height is ${declaredHeight}px but settings are ${expectedHeight}px.`);
  }

  if (wantsTransparency(prompt, html)) {
    if (!hasTransparentBase(html)) {
      addWarning(warnings, 'transparent-base-missing', 'Prompt suggests transparency, but html/body are not explicitly transparent.');
    }
    if (hasOpaqueBodyBackground(html) || hasOpaqueStageBackground(html)) {
      addWarning(warnings, 'transparent-mismatch', 'Prompt suggests transparency, but the page uses an opaque body or stage background.');
    }
  }

  const missingAssets = findMissingFileAssets(html);
  if (missingAssets.length > 0) {
    addWarning(warnings, 'missing-asset', `Missing local asset link: ${missingAssets[0]}`, 'error');
  }

  return {
    ok: warnings.every(warning => warning.severity !== 'error'),
    duration,
    warnings
  };
}

module.exports = {
  findMissingFileAssets,
  hasOpaqueStageBackground,
  parseDuration,
  validateOverlayHtml
};
