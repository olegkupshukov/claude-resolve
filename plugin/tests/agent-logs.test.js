const assert = require('assert');
const { addLog, clearLogs, getLogs, getLogSummary } = require('../ipc/agent-logs');

clearLogs();
addLog('codex', 'stderr', 'failed to load skill broken.yaml', { hidden: true });
addLog('codex', 'stderr', 'fatal: real failure', { level: 'error' });

assert.strictEqual(getLogs().length, 2);
assert.strictEqual(getLogs({ includeHidden: false }).length, 1);
assert.strictEqual(getLogSummary().hidden, 1);
assert.strictEqual(getLogSummary().lastFailure.message, 'fatal: real failure');

clearLogs();
assert.strictEqual(getLogs().length, 0);

console.log('agent-logs tests passed');
