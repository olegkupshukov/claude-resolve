const assert = require('assert');
const { createCodexJsonlParser } = require('../ipc/codex-parser');

function makeHarness() {
    const events = { stdout: [], stderr: [], status: [], done: [] };
    const parser = createCodexJsonlParser({
        stdout: value => events.stdout.push(value),
        stderr: value => events.stderr.push(value),
        status: value => events.status.push(value),
        done: value => events.done.push(value)
    });
    return { parser, events };
}

{
    const { parser } = makeHarness();
    parser.handleLine(JSON.stringify({ type: 'thread.started', thread_id: 'thread_123' }));
    assert.strictEqual(parser.state.threadId, 'thread_123');
}

{
    const { parser, events } = makeHarness();
    parser.handleLine(JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'Done.' }
    }));
    assert.deepStrictEqual(events.stdout, ['Done.']);
}

{
    const { parser, events } = makeHarness();
    parser.handleLine(JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 10, output_tokens: 4 }
    }));
    assert.deepStrictEqual(events.status, [{ type: 'tokens', input: 10, output: 4 }]);
    assert.deepStrictEqual(events.done, [0]);
}

{
    const { parser, events } = makeHarness();
    parser.handleLine(JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'error', message: 'fatal quota error' }
    }));
    assert.strictEqual(events.stderr[0], 'fatal quota error');
    assert.deepStrictEqual(events.done, [1]);
}

{
    const { parser, events } = makeHarness();
    parser.handleLine(JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'error', message: 'in-process app-server event stream lagged; dropped 2 events' }
    }));
    parser.handleLine(JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 1, output_tokens: 2 }
    }));
    assert.deepStrictEqual(events.stderr, []);
    assert.deepStrictEqual(events.done, [0]);
}

console.log('codex-parser tests passed');
