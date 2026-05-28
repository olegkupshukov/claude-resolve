const assert = require('assert');
const { createRenderQueue } = require('../ipc/render-queue');

const queue = createRenderQueue();
const job = queue.enqueue({ id: 'job-1', name: 'Title' });
assert.strictEqual(job.status, 'queued');
assert.strictEqual(queue.list().length, 1);

const rendering = queue.start('job-1');
assert.strictEqual(rendering.status, 'rendering');
assert.strictEqual(rendering.attempts, 1);

const failed = queue.fail('job-1', 'ffmpeg failed');
assert.strictEqual(failed.status, 'failed');
assert.strictEqual(failed.error, 'ffmpeg failed');

const retried = queue.retry('job-1');
assert.strictEqual(retried.status, 'queued');

queue.start('job-1');
const done = queue.complete('job-1', { name: 'title.mov' });
assert.strictEqual(done.status, 'done');
assert.strictEqual(queue.clearCompleted(), 1);
assert.strictEqual(queue.list().length, 0);

const recovered = createRenderQueue([{ id: 'job-2', status: 'rendering', name: 'Interrupted' }]);
assert.strictEqual(recovered.list()[0].status, 'interrupted');
assert.strictEqual(recovered.retry('job-2').status, 'queued');

console.log('render queue tests passed');
