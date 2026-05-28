const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./paths');
const { readTemplates } = require('./templates');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildShowcaseHtml(items = []) {
    const cards = items.map(item => {
        const prompt = item.prompt || '';
        const tags = (item.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
        return `<article class="card">
  ${item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="">` : '<div class="placeholder"></div>'}
  <div class="meta">${escapeHtml(item.category || 'template')}</div>
  <h2>${escapeHtml(item.title || item.name || 'Untitled')}</h2>
  <p>${escapeHtml(prompt)}</p>
  <div class="tags">${tags}</div>
  <button onclick="copyPrompt(${JSON.stringify(prompt).replace(/</g, '\\u003c')})">Copy prompt</button>
</article>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resolve AI Showcase</title>
<style>
body{margin:0;background:#111;color:#f4efe7;font-family:Arial,sans-serif}
header{padding:48px 6vw 24px}
h1{font-size:48px;margin:0 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;padding:24px 6vw 60px}
.card{background:#1b1b20;border:1px solid #2d2d34;border-radius:8px;overflow:hidden;padding:14px}
.card img,.placeholder{width:100%;aspect-ratio:16/9;object-fit:cover;background:#0b241c;border-radius:4px}
.meta,.tags span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#e8843a}
h2{font-size:20px;margin:12px 0 6px}
p{color:#c8c2b8;line-height:1.45}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
.tags span{border:1px solid #333;padding:4px 6px;border-radius:4px;color:#80c499}
button{background:linear-gradient(135deg,#e8843a,#80c499);border:0;border-radius:6px;padding:8px 10px;cursor:pointer}
</style>
</head>
<body>
<header><h1>Resolve AI Showcase</h1><p>AI motion graphics inside DaVinci Resolve.</p></header>
<main class="grid">${cards}</main>
<script>function copyPrompt(text){navigator.clipboard&&navigator.clipboard.writeText(text);}</script>
</body>
</html>`;
}

function buildShowcase(options = {}) {
    const templates = options.items || readTemplates().map(template => ({
        title: template.name,
        category: 'saved',
        prompt: template.prompt,
        thumbnail: template.thumbnail,
        tags: [template.provider, template.model].filter(Boolean)
    }));
    const outDir = options.outDir || path.join(CONFIG_DIR, 'showcase');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'index.html');
    fs.writeFileSync(outPath, buildShowcaseHtml(templates), 'utf8');
    return { success: true, path: outPath, count: templates.length };
}

function setupShowcaseHandlers(ipcMain) {
    ipcMain.handle('showcase:build', (_event, options) => buildShowcase(options));
}

module.exports = {
    buildShowcase,
    buildShowcaseHtml,
    setupShowcaseHandlers
};
