const NON_FATAL_ITEM_ERROR = /^in-process app-server event stream lagged; dropped \d+ events?$/i;

function getItemMessage(item) {
    if (!item) return '';
    if (typeof item.message === 'string') return item.message;
    if (item.error && typeof item.error.message === 'string') return item.error.message;
    return '';
}

function createCodexJsonlParser(callbacks = {}, state = {}) {
    const parserState = {
        threadId: null,
        completed: false,
        failed: false,
        ...state
    };

    function emit(name, payload) {
        if (typeof callbacks[name] === 'function') callbacks[name](payload);
    }

    function fail(message) {
        parserState.failed = true;
        if (message) emit('stderr', message);
        if (!parserState.completed) {
            parserState.completed = true;
            emit('done', 1);
        }
    }

    function handleItem(item) {
        if (!item) return;
        if (item.type === 'agent_message' && item.text) {
            emit('stdout', item.text);
            return;
        }
        if (item.type === 'command_execution') {
            emit('status', {
                type: 'tool',
                name: 'Codex',
                file: item.command || null
            });
            return;
        }
        if (item.type === 'error') {
            const message = getItemMessage(item);
            if (NON_FATAL_ITEM_ERROR.test(message)) {
                emit('status', { type: 'warning', message });
                return;
            }
            fail(message || 'Codex reported an error.');
        }
    }

    function handleEvent(event) {
        if (!event || typeof event !== 'object') return;

        if (event.type === 'thread.started') {
            parserState.threadId = event.thread_id || parserState.threadId;
            emit('status', { type: 'provider', provider: 'codex', threadId: parserState.threadId });
            return;
        }

        if (event.type === 'turn.started') {
            emit('status', { type: 'provider', provider: 'codex', threadId: parserState.threadId });
            return;
        }

        if (event.type === 'item.started') {
            handleItem(event.item);
            return;
        }

        if (event.type === 'item.completed') {
            handleItem(event.item);
            return;
        }

        if (event.type === 'turn.completed') {
            const usage = event.usage || {};
            emit('status', {
                type: 'tokens',
                input: usage.input_tokens || 0,
                output: usage.output_tokens || 0
            });
            if (!parserState.completed) {
                parserState.completed = true;
                emit('done', parserState.failed ? 1 : 0);
            }
            return;
        }

        if (event.type === 'turn.failed' || event.type === 'error') {
            fail(event.message || event.error?.message || 'Codex turn failed.');
        }
    }

    function handleLine(line) {
        if (!line || !line.trim()) return;
        try {
            handleEvent(JSON.parse(line));
        } catch {
            emit('stdout', line);
        }
    }

    return { state: parserState, handleEvent, handleLine };
}

module.exports = { createCodexJsonlParser, NON_FATAL_ITEM_ERROR };
