const MAX_LOGS = 300;

let logs = [];

function normalizeMessage(message) {
  const text = String(message || '').replace(/\r\n/g, '\n').trim();
  return text.length > 4000 ? `${text.slice(0, 4000)}\n... [truncated]` : text;
}

function addLog(provider, stream, message, options = {}) {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    provider: provider || 'agent',
    stream: stream || 'info',
    message: normalized,
    hidden: Boolean(options.hidden),
    level: options.level || (stream === 'stderr' ? 'error' : 'info')
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(logs.length - MAX_LOGS);
  return entry;
}

function getLogs(options = {}) {
  const includeHidden = options.includeHidden !== false;
  return includeHidden ? [...logs] : logs.filter(entry => !entry.hidden);
}

function clearLogs() {
  logs = [];
  return true;
}

function getLogSummary() {
  const visible = logs.filter(entry => !entry.hidden);
  const failures = logs.filter(entry => entry.level === 'error' && !entry.hidden);
  return {
    total: logs.length,
    visible: visible.length,
    hidden: logs.length - visible.length,
    lastFailure: failures.length ? failures[failures.length - 1] : null
  };
}

module.exports = {
  addLog,
  clearLogs,
  getLogs,
  getLogSummary
};
