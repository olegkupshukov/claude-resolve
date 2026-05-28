const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./paths');

const DEFAULT_STORE = path.join(CONFIG_DIR, 'templates.json');

function ensureStoreDir(storePath = DEFAULT_STORE) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
}

function readTemplates(storePath = DEFAULT_STORE) {
  if (!fs.existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTemplates(templates, storePath = DEFAULT_STORE) {
  ensureStoreDir(storePath);
  fs.writeFileSync(storePath, JSON.stringify(templates, null, 2), 'utf8');
  return templates;
}

function makeTemplateId(name) {
  const slug = String(name || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'template';
  return `${Date.now()}-${slug}`;
}

function normalizeTemplate(payload = {}) {
  const now = new Date().toISOString();
  const name = String(payload.name || payload.title || 'Untitled template').trim() || 'Untitled template';
  return {
    id: payload.id || makeTemplateId(name),
    name,
    prompt: String(payload.prompt || ''),
    html: String(payload.html || ''),
    thumbnail: payload.thumbnail || null,
    provider: payload.provider || null,
    model: payload.model || null,
    width: payload.width || null,
    height: payload.height || null,
    fps: payload.fps || null,
    createdAt: payload.createdAt || now,
    updatedAt: now
  };
}

function saveTemplatePayload(payload, storePath = DEFAULT_STORE) {
  const templates = readTemplates(storePath);
  const next = normalizeTemplate(payload);
  const existingIndex = templates.findIndex(template => template.id === next.id);
  if (existingIndex >= 0) templates[existingIndex] = { ...templates[existingIndex], ...next };
  else templates.unshift(next);
  writeTemplates(templates, storePath);
  return next;
}

function deleteTemplateById(id, storePath = DEFAULT_STORE) {
  const before = readTemplates(storePath);
  const after = before.filter(template => template.id !== id);
  writeTemplates(after, storePath);
  return { success: true, deleted: before.length - after.length };
}

function setupTemplateHandlers(ipcMain) {
  ipcMain.handle('templates:list', () => readTemplates());
  ipcMain.handle('templates:save', (_event, payload) => saveTemplatePayload(payload));
  ipcMain.handle('templates:delete', (_event, id) => deleteTemplateById(id));
  ipcMain.handle('templates:use', (_event, id) => readTemplates().find(template => template.id === id) || null);
}

module.exports = {
  deleteTemplateById,
  normalizeTemplate,
  readTemplates,
  saveTemplatePayload,
  setupTemplateHandlers,
  writeTemplates
};
