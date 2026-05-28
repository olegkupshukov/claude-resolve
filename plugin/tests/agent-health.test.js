const assert = require('assert');
const { normalizeHealthStatus } = require('../ipc/agent');

assert.deepStrictEqual(
  normalizeHealthStatus({ status: 'ready', version: 'codex 1.0' }),
  { status: 'ready', version: 'codex 1.0', installed: true, loggedIn: true }
);

assert.deepStrictEqual(
  normalizeHealthStatus({ status: 'not-logged-in' }),
  { status: 'not-logged-in', installed: true, loggedIn: false }
);

assert.deepStrictEqual(
  normalizeHealthStatus({ status: 'not-installed' }),
  { status: 'not-installed', installed: false, loggedIn: false }
);

console.log('agent-health tests passed');
