const assert = require('assert');
const { buildCodexArgs, isStaleCodexResumeError } = require('../ipc/codex');

assert.deepStrictEqual(
  buildCodexArgs({ threadId: null, modelId: 'gpt-5.3-codex' }),
  ['exec', '--ignore-user-config', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', 'gpt-5.3-codex', '-']
);

assert.deepStrictEqual(
  buildCodexArgs({ threadId: 'thread_123', modelId: 'gpt-5.3-codex' }),
  ['exec', 'resume', '--ignore-user-config', '--json', '--skip-git-repo-check', 'thread_123', '-']
);

assert(!buildCodexArgs({ threadId: 'thread_123', modelId: null }).includes('--sandbox'));
assert(!buildCodexArgs({ threadId: 'thread_123', modelId: 'gpt-5.3-codex' }).includes('--model'));

assert.strictEqual(
  isStaleCodexResumeError('Error: thread/resume: thread/resume failed: no rollout found for thread id 019edc9c (code -32600)'),
  true
);
assert.strictEqual(isStaleCodexResumeError('Error: quota exceeded'), false);

console.log('codex-args tests passed');
